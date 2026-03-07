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
        var existingCachedPath = cachedPdfCandidates.FirstOrDefault(System.IO.File.Exists);
        if (!string.IsNullOrWhiteSpace(existingCachedPath))
        {
            _logger.LogInformation("Drawing preview file resolved from verification cache for detail '{DetailName}': '{ResolvedPath}'.", detailName, existingCachedPath);

            var cachedContentType = ResolveContentType(Path.GetExtension(existingCachedPath));
            Response.Headers.Append("X-Drawing-Path", existingCachedPath);
            Response.Headers.Append("X-Drawing-FileName", Path.GetFileName(existingCachedPath));

            return PhysicalFile(existingCachedPath, cachedContentType, enableRangeProcessing: true);
        }

        var match = FindPreviewMatch(detailName);

        _logger.LogInformation(
            "Drawing preview request for detail '{DetailName}'. LinkServer: '{LinkServer}'. Match found: {HasMatch}.",
            detailName,
            string.IsNullOrWhiteSpace(linkServer) ? "<empty>" : linkServer,
            match is not null);

        if (match is null)
        {
            var candidatesWithoutIndex = GetCandidatesWithoutIndex(detailName, linkServer).ToList();
            var candidatesText = candidatesWithoutIndex.Count > 0
                ? string.Join("; ", candidatesWithoutIndex)
                : "нет доступных путей";

            _logger.LogWarning(
                "Drawing preview not found in index for detail '{DetailName}'. Candidates without index: {Candidates}.",
                detailName,
                candidatesText);

            return NotFound($"Чертеж не найден в индексе для детали '{detailName}'. Проверенные пути: {candidatesText}");
        }

        var candidates = GetPathCandidates(match, linkServer).ToList();
        if (candidates.Count == 0)
        {
            _logger.LogWarning(
                "Drawing preview has no path candidates for detail '{DetailName}'. RelativePath: '{RelativePath}', RootPath: '{RootPath}'.",
                detailName,
                match.File.RelativePath,
                match.RootPath);
        }

        foreach (var candidate in candidates)
        {
            _logger.LogInformation(
                "Drawing preview candidate for detail '{DetailName}': '{CandidatePath}'. Exists: {Exists}.",
                detailName,
                candidate,
                System.IO.File.Exists(candidate));
        }

        var existingPath = candidates.FirstOrDefault(System.IO.File.Exists);

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

    private IndexedFileMatch? FindPreviewMatch(string detailName)
    {
        var exactMatch = _fileIndexStore
            .FindByDetailName(detailName)
            .FirstOrDefault(IsPdfMatch);
        if (exactMatch is not null)
        {
            return exactMatch;
        }

        var normalizedType1Name = NormalizeType1DetailName(detailName);
        if (string.Equals(normalizedType1Name, detailName, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var fallbackMatch = _fileIndexStore
            .FindByDetailName(normalizedType1Name)
            .FirstOrDefault(IsPdfMatch);
        if (fallbackMatch is not null)
        {
            _logger.LogInformation(
                "Drawing preview fallback applied. Requested detail '{DetailName}' resolved to '{NormalizedDetailName}'.",
                detailName,
                normalizedType1Name);
        }

        return fallbackMatch;
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
        var rawRelativePath = match.File.RelativePath?.Trim() ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(linkServer))
        {
            yield return CombinePath(linkServer, rawRelativePath);
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

    private static bool IsPdfMatch(IndexedFileMatch match)
    {
        return string.Equals(match.File.Extension, ".pdf", StringComparison.OrdinalIgnoreCase)
               || string.Equals(Path.GetExtension(match.File.FileName), ".pdf", StringComparison.OrdinalIgnoreCase);
    }

    private static string CombinePath(string basePath, string relativePath)
    {
        if (IsAbsolutePath(relativePath))
        {
            return relativePath.Trim();
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
