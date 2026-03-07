using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.FileIndexing;
using SLS_Planning_1C.Server.Features.Verification;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/file-index")]
public sealed class FileIndexController : ControllerBase
{
    private readonly IFileIndexStore _fileIndexStore;
    private readonly IVerificationSettingsStore _verificationSettingsStore;
    private readonly IVerificationResultCacheStore _verificationResultCacheStore;
    private readonly ILogger<FileIndexController> _logger;

    public FileIndexController(
        IFileIndexStore fileIndexStore,
        IVerificationSettingsStore verificationSettingsStore,
        IVerificationResultCacheStore verificationResultCacheStore,
        ILogger<FileIndexController> logger)
    {
        _fileIndexStore = fileIndexStore;
        _verificationSettingsStore = verificationSettingsStore;
        _verificationResultCacheStore = verificationResultCacheStore;
        _logger = logger;
    }

    [HttpPost("sync")]
    [HttpPost("sync-full")]
    public ActionResult<FileIndexSyncResponse> Sync([FromBody] FileIndexSyncRequest request)
    {
        try
        {
            var result = _fileIndexStore.UpsertSnapshot(request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }


    [HttpPost("sync-delta")]
    public ActionResult<FileIndexSyncResponse> SyncDelta([FromBody] FileIndexDeltaSyncRequest request)
    {
        try
        {
            var result = _fileIndexStore.ApplyDelta(request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }


    [HttpPost("clear")]
    public IActionResult Clear()
    {
        _fileIndexStore.ClearAllSnapshots();
        return Ok();
    }

    [HttpPost("test")]
    public ActionResult<string> Test([FromBody] FileIndexTestRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FileName))
        {
            return BadRequest("FileName is required.");
        }

        return Ok("Дякую");
    }

    [HttpGet("drawing-preview")]
    public IActionResult DrawingPreview([FromQuery] string detailName)
    {
        if (string.IsNullOrWhiteSpace(detailName))
        {
            _logger.LogWarning("Drawing preview request rejected: detailName is empty.");
            return BadRequest("detailName is required.");
        }

        var linkServer = _verificationSettingsStore.Get().SpecificationSettings.LinkServer;
        var cachedPdfCandidates = GetCachedPdfCandidates(detailName).ToList();
        var existingCachedPath = FindExistingPath(cachedPdfCandidates);
        if (!string.IsNullOrWhiteSpace(existingCachedPath))
        {
            _logger.LogInformation("Drawing preview file resolved from verification cache for detail '{DetailName}': '{ResolvedPath}'.", detailName, existingCachedPath);

            var cachedContentType = ResolveContentType(Path.GetExtension(existingCachedPath));
            Response.Headers.Append("X-Drawing-Path", existingCachedPath);
            Response.Headers.Append("X-Drawing-FileName", Path.GetFileName(existingCachedPath));

            return PhysicalFile(existingCachedPath, cachedContentType, enableRangeProcessing: true);
        }

        var matches = FindPreviewMatches(detailName).ToList();

        _logger.LogInformation(
            "Drawing preview request for detail '{DetailName}'. LinkServer: '{LinkServer}'. Match count: {MatchCount}.",
            detailName,
            string.IsNullOrWhiteSpace(linkServer) ? "<empty>" : linkServer,
            matches.Count);

        var candidates = matches
            .SelectMany(match => GetPathCandidates(match, linkServer))
            .Concat(GetCandidatesWithoutIndex(detailName, linkServer))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (matches.Count == 0)
        {
            _logger.LogWarning(
                "Drawing preview not found in index for detail '{DetailName}'. Fallback candidates count: {CandidateCount}.",
                detailName,
                candidates.Count);
        }

        foreach (var candidate in candidates)
        {
            _logger.LogInformation(
                "Drawing preview candidate for detail '{DetailName}': '{CandidatePath}'. Exists: {Exists}.",
                detailName,
                candidate,
                System.IO.File.Exists(NormalizePathCandidate(candidate)));
        }

        var existingPath = FindExistingPath(candidates);

        if (string.IsNullOrWhiteSpace(existingPath))
        {
            _logger.LogWarning("Drawing preview file not found on disk for detail '{DetailName}'.", detailName);
            var candidatesText = candidates.Count > 0
                ? string.Join("; ", candidates)
                : "нет доступных путей";

            return NotFound($"Чертеж не найден. Проверенные пути: {candidatesText}");
        }

        _logger.LogInformation("Drawing preview file resolved for detail '{DetailName}': '{ResolvedPath}'.", detailName, existingPath);

        var contentType = ResolveContentType(Path.GetExtension(existingPath));
        Response.Headers.Append("X-Drawing-Path", existingPath);
        Response.Headers.Append("X-Drawing-FileName", Path.GetFileName(existingPath));

        return PhysicalFile(existingPath, contentType, enableRangeProcessing: true);
    }


    private IEnumerable<string> GetCachedPdfCandidates(string detailName)
    {
        var normalizedName = detailName.Trim();
        foreach (var candidate in _verificationResultCacheStore.GetPdfPaths(normalizedName))
        {
            yield return candidate;
        }

        var fallbackName = NormalizeType1DetailName(normalizedName);
        if (string.Equals(fallbackName, normalizedName, StringComparison.OrdinalIgnoreCase))
        {
            yield break;
        }

        foreach (var candidate in _verificationResultCacheStore.GetPdfPaths(fallbackName))
        {
            yield return candidate;
        }
    }

    private IEnumerable<IndexedFileMatch> FindPreviewMatches(string detailName)
    {
        var exactMatches = _fileIndexStore
            .FindByDetailName(detailName)
            .Where(IsPdfMatch)
            .ToList();

        foreach (var exact in exactMatches)
        {
            yield return exact;
        }

        var normalizedType1Name = NormalizeType1DetailName(detailName);
        if (string.Equals(normalizedType1Name, detailName, StringComparison.OrdinalIgnoreCase))
        {
            yield break;
        }

        _logger.LogInformation(
            "Drawing preview fallback applied. Requested detail '{DetailName}' resolved to '{NormalizedDetailName}'.",
            detailName,
            normalizedType1Name);

        foreach (var fallback in _fileIndexStore.FindByDetailName(normalizedType1Name).Where(IsPdfMatch))
        {
            yield return fallback;
        }
    }

    private static string NormalizeType1DetailName(string detailName)
    {
        var normalized = detailName.Trim();
        var dashIndex = normalized.LastIndexOf('-');
        var lastDotIndex = normalized.LastIndexOf('.');

        if (dashIndex > lastDotIndex)
        {
            normalized = normalized[..dashIndex].Trim();
        }

        return normalized;
    }

    private static IEnumerable<string> GetPathCandidates(IndexedFileMatch match, string? linkServer)
    {
        var rawRelativePath = NormalizePathCandidate(match.File.RelativePath);
        var yielded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (IsAbsolutePath(rawRelativePath))
        {
            var absoluteCandidate = NormalizePathCandidate(rawRelativePath);
            if (!string.IsNullOrWhiteSpace(absoluteCandidate) && yielded.Add(absoluteCandidate))
            {
                yield return absoluteCandidate;
            }
        }

        if (!string.IsNullOrWhiteSpace(linkServer))
        {
            var linkServerCandidate = CombinePath(linkServer, rawRelativePath);
            if (!string.IsNullOrWhiteSpace(linkServerCandidate) && yielded.Add(linkServerCandidate))
            {
                yield return linkServerCandidate;
            }
        }

        if (!string.IsNullOrWhiteSpace(match.RootPath))
        {
            var snapshotRootCandidate = CombinePath(match.RootPath, rawRelativePath);
            if (!string.IsNullOrWhiteSpace(snapshotRootCandidate) && yielded.Add(snapshotRootCandidate))
            {
                yield return snapshotRootCandidate;
            }
        }
    }

    private static IEnumerable<string> GetCandidatesWithoutIndex(string detailName, string? linkServer)
    {
        var normalizedName = detailName.Trim();
        var fallbackName = NormalizeType1DetailName(normalizedName);
        var fileNames = new[]
        {
            $"{normalizedName}.pdf",
            $"{fallbackName}.pdf"
        }
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList();

        if (!string.IsNullOrWhiteSpace(linkServer))
        {
            foreach (var fileName in fileNames)
            {
                yield return CombinePath(linkServer, fileName);
            }
        }
    }

    private static string? FindExistingPath(IEnumerable<string> candidates)
    {
        foreach (var candidate in candidates)
        {
            var normalizedCandidate = NormalizePathCandidate(candidate);
            if (string.IsNullOrWhiteSpace(normalizedCandidate))
            {
                continue;
            }

            if (System.IO.File.Exists(normalizedCandidate))
            {
                return normalizedCandidate;
            }

            var caseInsensitiveCandidate = TryResolveCaseInsensitivePath(normalizedCandidate);
            if (!string.IsNullOrWhiteSpace(caseInsensitiveCandidate))
            {
                return caseInsensitiveCandidate;
            }
        }

        return null;
    }

    private static bool IsPdfMatch(IndexedFileMatch match)
    {
        return string.Equals(match.File.Extension, ".pdf", StringComparison.OrdinalIgnoreCase)
               || string.Equals(Path.GetExtension(match.File.FileName), ".pdf", StringComparison.OrdinalIgnoreCase);
    }

    private static string CombinePath(string basePath, string relativePath)
    {
        basePath = NormalizePathCandidate(basePath);
        relativePath = NormalizePathCandidate(relativePath);

        if (IsAbsolutePath(relativePath))
        {
            return relativePath;
        }

        var separator = DetectSeparator(basePath);
        var normalizedBase = TrimTrailingSeparators(basePath, separator);
        var normalizedRelative = NormalizeRelativePath(relativePath, separator);

        if (string.IsNullOrWhiteSpace(normalizedBase))
        {
            return normalizedRelative;
        }

        if (string.IsNullOrWhiteSpace(normalizedRelative))
        {
            return normalizedBase;
        }

        return $"{normalizedBase}{separator}{normalizedRelative}";
    }


    private static bool IsAbsolutePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        return Path.IsPathRooted(path) || LooksLikeWindowsPath(path);
    }

    private static string NormalizePathCandidate(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return string.Empty;
        }

        var normalized = path.Trim().Trim('"');

        if (Uri.TryCreate(normalized, UriKind.Absolute, out var uri) && uri.IsFile)
        {
            normalized = uri.LocalPath;
        }

        // Windows extended-length prefix: \\?\C:\folder\file.pdf
        if (normalized.StartsWith("\\\\?\\", StringComparison.Ordinal))
        {
            normalized = normalized[4..];
        }

        return normalized;
    }

    private static string? TryResolveCaseInsensitivePath(string fullPath)
    {
        var normalizedPath = NormalizePathCandidate(fullPath);
        if (string.IsNullOrWhiteSpace(normalizedPath))
        {
            return null;
        }

        if (System.IO.File.Exists(normalizedPath))
        {
            return normalizedPath;
        }

        var directory = Path.GetDirectoryName(normalizedPath);
        var fileName = Path.GetFileName(normalizedPath);

        if (!string.IsNullOrWhiteSpace(directory) && !string.IsNullOrWhiteSpace(fileName) && Directory.Exists(directory))
        {
            var matchedPath = Directory
                .EnumerateFiles(directory)
                .FirstOrDefault(path => string.Equals(Path.GetFileName(path), fileName, StringComparison.OrdinalIgnoreCase));

            if (!string.IsNullOrWhiteSpace(matchedPath))
            {
                return matchedPath;
            }
        }

        return TryResolveCaseInsensitiveBySegments(normalizedPath);
    }

    private static string? TryResolveCaseInsensitiveBySegments(string fullPath)
    {
        var root = Path.GetPathRoot(fullPath);
        if (string.IsNullOrWhiteSpace(root))
        {
            return null;
        }

        var trimmedRoot = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var remainder = fullPath[root.Length..].Trim(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var segments = remainder
            .Split(new[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries);

        if (segments.Length == 0)
        {
            return Directory.Exists(root) ? root : null;
        }

        var current = string.IsNullOrWhiteSpace(trimmedRoot) ? root : trimmedRoot;

        for (var i = 0; i < segments.Length; i++)
        {
            if (!Directory.Exists(current))
            {
                return null;
            }

            var isLast = i == segments.Length - 1;
            var candidates = isLast
                ? Directory.EnumerateFileSystemEntries(current)
                : Directory.EnumerateDirectories(current);

            var match = candidates.FirstOrDefault(entry => string.Equals(
                Path.GetFileName(entry),
                segments[i],
                StringComparison.OrdinalIgnoreCase));

            if (string.IsNullOrWhiteSpace(match))
            {
                return null;
            }

            current = match;
        }

        return System.IO.File.Exists(current) ? current : null;
    }

    private static string NormalizeRelativePath(string path, char separator)
    {
        var trimmed = path.TrimStart('\\', '/');
        return trimmed.Replace('/', separator).Replace('\\', separator);
    }

    private static string TrimTrailingSeparators(string path, char separator)
    {
        return path.TrimEnd(separator, separator == '\\' ? '/' : '\\');
    }

    private static char DetectSeparator(string path)
    {
        return LooksLikeWindowsPath(path) ? '\\' : '/';
    }

    private static bool LooksLikeWindowsPath(string path)
    {
        var trimmed = path.Trim();

        if (trimmed.StartsWith("\\\\", StringComparison.Ordinal))
        {
            return true;
        }

        return trimmed.Length >= 2
            && char.IsLetter(trimmed[0])
            && trimmed[1] == ':';
    }

    private static string ResolveContentType(string? extension)
    {
        return extension?.ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".bmp" => "image/bmp",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".svg" => "image/svg+xml",
            _ => "application/octet-stream"
        };
    }
}

public sealed class FileIndexTestRequest
{
    public required string FileName { get; init; }
}
