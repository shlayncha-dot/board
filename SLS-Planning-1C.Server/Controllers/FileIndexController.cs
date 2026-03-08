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
        var previewLinkResult = ResolveDrawingPreviewLink(detailName);
        if (previewLinkResult.ErrorResult is not null)
        {
            return previewLinkResult.ErrorResult;
        }

        if (LooksLikeHttpUrl(previewLinkResult.PreviewUrl!))
        {
            return Redirect(previewLinkResult.PreviewUrl!);
        }

        return Ok(new DrawingPreviewLinkResponse
        {
            DetailName = detailName.Trim(),
            PreviewUrl = previewLinkResult.PreviewUrl!
        });
    }

    [HttpGet("drawing-preview-link")]
    public IActionResult DrawingPreviewLink([FromQuery] string detailName)
    {
        var previewLinkResult = ResolveDrawingPreviewLink(detailName);
        if (previewLinkResult.ErrorResult is not null)
        {
            return previewLinkResult.ErrorResult;
        }

        return Ok(new DrawingPreviewLinkResponse
        {
            DetailName = detailName.Trim(),
            PreviewUrl = previewLinkResult.PreviewUrl!
        });
    }

    private DrawingPreviewLinkResolution ResolveDrawingPreviewLink(string detailName)
    {
        if (string.IsNullOrWhiteSpace(detailName))
        {
            _logger.LogWarning("Drawing preview request rejected: detailName is empty.");
            return new DrawingPreviewLinkResolution
            {
                ErrorResult = BadRequest("detailName is required.")
            };
        }

        if (!_verificationResultCacheStore.HasVerificationSnapshot())
        {
            _logger.LogWarning("Drawing preview request rejected for detail '{DetailName}': verification was not executed yet.", detailName);
            return new DrawingPreviewLinkResolution
            {
                ErrorResult = BadRequest("Сначала сделайте верификацию")
            };
        }

        var linkServer = _verificationSettingsStore.Get().SpecificationSettings.LinkServer;
        var cachedPdfCandidates = GetCachedPdfCandidates(detailName, linkServer).ToList();
        var primaryCachedCandidate = cachedPdfCandidates.FirstOrDefault();

        if (string.IsNullOrWhiteSpace(primaryCachedCandidate))
        {
            _logger.LogWarning("Drawing preview file is missing in verification cache for detail '{DetailName}'.", detailName);
            return new DrawingPreviewLinkResolution
            {
                ErrorResult = NotFound("Файл не найден")
            };
        }

        var previewUrl = FindPreviewUrlCandidate(cachedPdfCandidates);
        if (string.IsNullOrWhiteSpace(previewUrl))
        {
            previewUrl = NormalizePathCandidate(primaryCachedCandidate);
        }

        if (string.IsNullOrWhiteSpace(previewUrl))
        {
            var missingReason = BuildMissingFileReason(primaryCachedCandidate);

            _logger.LogWarning(
                "Drawing preview file path is empty for detail '{DetailName}'. Candidate: '{CandidatePath}'. Reason: {MissingReason}",
                detailName,
                primaryCachedCandidate,
                missingReason);

            return new DrawingPreviewLinkResolution
            {
                ErrorResult = NotFound($"Файл не найден. Проверенный путь: {primaryCachedCandidate}. Причина: {missingReason}")
            };
        }

        _logger.LogInformation("Drawing preview url resolved from verification cache for detail '{DetailName}': '{ResolvedPreviewUrl}'.", detailName, previewUrl);

        return new DrawingPreviewLinkResolution
        {
            PreviewUrl = previewUrl
        };
    }


    private IEnumerable<string> GetCachedPdfCandidates(string detailName, string? linkServer)
    {
        var normalizedName = detailName.Trim();
        foreach (var candidate in _verificationResultCacheStore.GetPdfPaths(normalizedName))
        {
            yield return BuildVerificationPathCandidate(candidate, linkServer);
        }
    }

    private static string BuildVerificationPathCandidate(string verificationPath, string? linkServer)
    {
        var normalizedVerificationPath = NormalizePathCandidate(verificationPath);
        if (string.IsNullOrWhiteSpace(normalizedVerificationPath))
        {
            return string.Empty;
        }

        if (LooksLikeHttpUrl(normalizedVerificationPath))
        {
            return normalizedVerificationPath;
        }

        if (IsAbsolutePath(normalizedVerificationPath))
        {
            return normalizedVerificationPath;
        }

        if (string.IsNullOrWhiteSpace(linkServer))
        {
            return normalizedVerificationPath;
        }

        return CombinePath(linkServer, normalizedVerificationPath);
    }

    private static string? FindPreviewUrlCandidate(IEnumerable<string> candidates)
    {
        foreach (var candidate in candidates)
        {
            var normalizedCandidate = NormalizePathCandidate(candidate);
            if (string.IsNullOrWhiteSpace(normalizedCandidate))
            {
                continue;
            }

            if (LooksLikeHttpUrl(normalizedCandidate) || LooksLikeWindowsPath(normalizedCandidate))
            {
                return normalizedCandidate;
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

    private static bool LooksLikeHttpUrl(string path)
    {
        if (!Uri.TryCreate(path, UriKind.Absolute, out var uri))
        {
            return false;
        }

        return string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            || string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildMissingFileReason(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return "в кэше верификации не найден путь к PDF";
        }

        var normalizedPath = NormalizePathCandidate(path);
        if (string.IsNullOrWhiteSpace(normalizedPath))
        {
            return "путь к файлу пустой после нормализации";
        }

        if (normalizedPath.StartsWith("\\\\", StringComparison.Ordinal) && !OperatingSystem.IsWindows())
        {
            return "backend работает не в Windows и не может читать UNC-пути (\\\\server\\share) напрямую";
        }

        var directory = Path.GetDirectoryName(normalizedPath);
        if (string.IsNullOrWhiteSpace(directory))
        {
            return "не удалось определить папку файла";
        }

        if (!Directory.Exists(directory))
        {
            return "каталог файла недоступен для backend-процесса";
        }

        return "файл отсутствует или недоступен по правам для backend-процесса";
    }
}

public sealed class DrawingPreviewLinkResponse
{
    public required string DetailName { get; init; }
    public required string PreviewUrl { get; init; }
}

public sealed class DrawingPreviewLinkResolution
{
    public IActionResult? ErrorResult { get; init; }
    public string? PreviewUrl { get; init; }
}

public sealed class FileIndexTestRequest
{
    public required string FileName { get; init; }
}
