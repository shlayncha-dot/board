using System.Text.RegularExpressions;
using SLS_Planning_1C.Server.Features.FileIndexing;

namespace SLS_Planning_1C.Server.Features.Verification;

public interface IVerificationService
{
    VerificationResponse Verify(VerificationRequest request);
}

public sealed class VerificationService : IVerificationService
{
    private static readonly HashSet<string> AllowedDetailTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "деталь",
        "деталь_кон",
        "деталь_св"
    };

    private readonly IFileIndexStore _fileIndexStore;
    private readonly IVerificationSettingsStore _verificationSettingsStore;
    private readonly IVerificationResultCacheStore _verificationResultCacheStore;

    public VerificationService(
        IFileIndexStore fileIndexStore,
        IVerificationSettingsStore verificationSettingsStore,
        IVerificationResultCacheStore verificationResultCacheStore)
    {
        _fileIndexStore = fileIndexStore;
        _verificationSettingsStore = verificationSettingsStore;
        _verificationResultCacheStore = verificationResultCacheStore;
    }

    public VerificationResponse Verify(VerificationRequest request)
    {
        var allIndexedFiles = _fileIndexStore.GetAllIndexedFiles();
        var dxfFiles = allIndexedFiles.Where(f => string.Equals(f.Extension, ".dxf", StringComparison.OrdinalIgnoreCase)).ToList();
        var pdfFiles = allIndexedFiles.Where(f => string.Equals(f.Extension, ".pdf", StringComparison.OrdinalIgnoreCase)).ToList();

        var designationColumn = ResolveColumnKey(request.Rows, "обознач");
        var typeColumn = ResolveColumnKey(request.Rows, "тип");

        var linkServer = _verificationSettingsStore.Get().SpecificationSettings.LinkServer;

        var dxfResolved = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase);
        var pdfResolved = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase);

        var dxfIssues = VerifyDxf(request.Rows, designationColumn, typeColumn, dxfFiles, linkServer, dxfResolved);
        var pdfIssues = VerifyPdf(request.Rows, designationColumn, typeColumn, request.TypeRules, pdfFiles, linkServer, pdfResolved);

        UpdateCache(request.Rows, designationColumn, dxfResolved, pdfResolved);

        return new VerificationResponse
        {
            Dxf = BuildBlockResult("DXF", dxfIssues, "Все файлы DXF найдены"),
            Pdf = BuildBlockResult("PDF", pdfIssues, "Все файлы PDF найдены")
        };
    }

    private static VerificationBlockResultDto BuildBlockResult(string blockName, IReadOnlyList<VerificationIssueDto> issues, string okMessage)
    {
        return new VerificationBlockResultDto
        {
            BlockName = blockName,
            IsSuccess = issues.Count == 0,
            Message = issues.Count == 0 ? okMessage : $"Найдено проблем: {issues.Count}",
            Issues = issues
        };
    }

    private static List<VerificationIssueDto> VerifyDxf(
        IReadOnlyList<VerifyRowDto> rows,
        string? designationColumn,
        string? typeColumn,
        IReadOnlyList<IndexedFileDto> dxfFiles,
        string? linkServer,
        IDictionary<string, IReadOnlyList<string>> resolvedPaths)
    {
        var issues = new List<VerificationIssueDto>();
        if (designationColumn is null || typeColumn is null)
        {
            return issues;
        }

        foreach (var row in rows)
        {
            if (!row.Values.TryGetValue(typeColumn, out var detailType) || !IsAllowedDetailType(detailType))
            {
                continue;
            }

            if (!row.Values.TryGetValue(designationColumn, out var detailName) || string.IsNullOrWhiteSpace(detailName))
            {
                continue;
            }

            var found = FindExactByFileName(detailName, dxfFiles);
            resolvedPaths[detailName] = BuildIssuePaths(found, linkServer);
            AddIssues(row.RowId, detailName, found, issues, linkServer);
        }

        return issues;
    }

    private static bool ShouldSkipPdfSearch(string detailName)
    {
        return Regex.IsMatch(detailName.Trim(), @"(?:^|[\s\-_])WD$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    private static bool IsAllowedDetailType(string detailType)
    {
        var normalized = detailType.Trim().ToLowerInvariant();
        return AllowedDetailTypes.Contains(normalized);
    }

    private static List<VerificationIssueDto> VerifyPdf(
        IReadOnlyList<VerifyRowDto> rows,
        string? designationColumn,
        string? typeColumn,
        IReadOnlyList<VerificationTypeRuleDto> typeRules,
        IReadOnlyList<IndexedFileDto> pdfFiles,
        string? linkServer,
        IDictionary<string, IReadOnlyList<string>> resolvedPaths)
    {
        var issues = new List<VerificationIssueDto>();
        if (designationColumn is null || typeColumn is null)
        {
            return issues;
        }

        foreach (var row in rows)
        {
            if (!row.Values.TryGetValue(typeColumn, out var detailType) || !IsAllowedDetailType(detailType))
            {
                continue;
            }

            if (!row.Values.TryGetValue(designationColumn, out var detailName) || string.IsNullOrWhiteSpace(detailName))
            {
                continue;
            }

            if (ShouldSkipPdfSearch(detailName))
            {
                continue;
            }

            var detailPrefix = detailName.Split('.', 2)[0];
            var type = ResolveType(detailPrefix, typeRules);
            var found = type switch
            {
                1 => ApplyType1Algorithm(detailName, pdfFiles),
                2 => ApplyType2Algorithm(detailName, pdfFiles),
                3 => ApplyType3Algorithm(detailName, pdfFiles),
                4 => ApplyType4Algorithm(detailName, pdfFiles),
                5 => ApplyType5Algorithm(detailName, pdfFiles),
                _ => ApplyType1Algorithm(detailName, pdfFiles)
            };

            resolvedPaths[detailName] = BuildIssuePaths(found, linkServer);
            AddIssues(row.RowId, detailName, found, issues, linkServer);
        }

        return issues;
    }


    private void UpdateCache(
        IReadOnlyList<VerifyRowDto> rows,
        string? designationColumn,
        IReadOnlyDictionary<string, IReadOnlyList<string>> dxfResolved,
        IReadOnlyDictionary<string, IReadOnlyList<string>> pdfResolved)
    {
        if (designationColumn is null)
        {
            _verificationResultCacheStore.ReplaceAll([]);
            return;
        }

        var entries = rows
            .Select(row => row.Values.TryGetValue(designationColumn, out var detailName) ? detailName?.Trim() : null)
            .Where(detailName => !string.IsNullOrWhiteSpace(detailName))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(detailName => new VerifiedDetailCacheEntry
            {
                DetailName = detailName!,
                DxfPaths = dxfResolved.TryGetValue(detailName!, out var dxfPaths) ? dxfPaths : [],
                PdfPaths = pdfResolved.TryGetValue(detailName!, out var pdfPaths) ? pdfPaths : []
            })
            .ToList();

        _verificationResultCacheStore.ReplaceAll(entries);
    }

    private static void AddIssues(string rowId, string detailName, IReadOnlyList<IndexedFileDto> found, ICollection<VerificationIssueDto> issues, string? linkServer)
    {
        if (found.Count == 1)
        {
            return;
        }

        issues.Add(new VerificationIssueDto
        {
            RowId = rowId,
            DetailName = detailName,
            Severity = found.Count == 0 ? VerificationSeverity.Missing : VerificationSeverity.Duplicate,
            Paths = BuildIssuePaths(found, linkServer)
        });
    }


    private static IReadOnlyList<string> BuildIssuePaths(IReadOnlyList<IndexedFileDto> found, string? linkServer)
    {
        return found
            .Select(file => BuildIssuePath(file.RelativePath, linkServer))
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .ToList();
    }

    private static string BuildIssuePath(string? relativePath, string? linkServer)
    {
        var normalizedRelativePath = NormalizePath(relativePath);
        if (string.IsNullOrWhiteSpace(normalizedRelativePath))
        {
            return string.Empty;
        }

        if (IsAbsoluteHttpUrl(normalizedRelativePath) || IsWindowsRootedPath(normalizedRelativePath) || string.IsNullOrWhiteSpace(linkServer))
        {
            return normalizedRelativePath;
        }

        var normalizedRoot = NormalizePath(linkServer);
        if (string.IsNullOrWhiteSpace(normalizedRoot))
        {
            return normalizedRelativePath;
        }

        if (IsAbsoluteHttpUrl(normalizedRoot))
        {
            return BuildGatewayDocumentUrl(normalizedRoot, normalizedRelativePath);
        }

        normalizedRoot = normalizedRoot.TrimEnd('\\');

        return $"{normalizedRoot}\\{normalizedRelativePath.TrimStart('\\')}";
    }

    private static string NormalizePath(string? path)
    {
        return (path ?? string.Empty).Trim();
    }

    private static string CombineHttpPath(string httpRoot, string relativePath)
    {
        var normalizedRoot = httpRoot.TrimEnd('/');
        var normalizedRelative = relativePath
            .Replace('\\', '/')
            .TrimStart('/');

        return $"{normalizedRoot}/{normalizedRelative}";
    }

    private static string BuildGatewayDocumentUrl(string gatewayRoot, string relativePath)
    {
        var relativePathForQuery = relativePath.Replace('\\', '/');
        var encodedRelativePath = Uri.EscapeDataString(relativePathForQuery);
        return $"{CombineHttpPath(gatewayRoot, "pdf")}?relativePath={encodedRelativePath}";
    }

    private static bool IsAbsoluteHttpUrl(string path)
    {
        if (!Uri.TryCreate(path, UriKind.Absolute, out var uri))
        {
            return false;
        }

        return string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            || string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsWindowsRootedPath(string path)
    {
        if (path.StartsWith(@"\\", StringComparison.Ordinal))
        {
            return true;
        }

        return path.Length >= 3
               && char.IsLetter(path[0])
               && path[1] == ':'
               && (path[2] == '\\' || path[2] == '/');
    }

    private static IReadOnlyList<IndexedFileDto> FindExactByFileName(string detailName, IReadOnlyList<IndexedFileDto> files)
    {
        return files
            .Where(file => string.Equals(Path.GetFileNameWithoutExtension(file.FileName), detailName, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    private static int ResolveType(string detailPrefix, IReadOnlyList<VerificationTypeRuleDto> typeRules)
    {
        foreach (var rule in typeRules)
        {
            if (ConditionContainsPrefix(rule.Condition, detailPrefix))
            {
                return rule.Type;
            }
        }

        return 1;
    }

    private static bool ConditionContainsPrefix(string condition, string detailPrefix)
    {
        if (string.IsNullOrWhiteSpace(condition))
        {
            return false;
        }

        var parts = condition
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return parts.Any(p => string.Equals(p, detailPrefix, StringComparison.OrdinalIgnoreCase));
    }

    private static IReadOnlyList<IndexedFileDto> ApplyType1Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files)
    {
        var normalizedDetailName = NormalizeType1DetailName(detailName);
        if (string.IsNullOrWhiteSpace(normalizedDetailName))
        {
            return [];
        }

        return FindExactByFileName(normalizedDetailName, files);
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

    private static IReadOnlyList<IndexedFileDto> ApplyType2Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files)
    {
        var detailKey = ExtractType2SearchKey(detailName);
        if (detailKey is null)
        {
            return [];
        }

        var key = detailKey.Value;

        return files
            .Where(file =>
            {
                var fileKey = ExtractType2SearchKey(Path.GetFileNameWithoutExtension(file.FileName));
                return fileKey is not null
                    && string.Equals(fileKey.Value.Prefix, key.Prefix, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(fileKey.Value.Suffix, key.Suffix, StringComparison.Ordinal);
            })
            .ToList();
    }

    private static Type2SearchKey? ExtractType2SearchKey(string value)
    {
        var normalized = NormalizeType1DetailName(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var firstDot = normalized.IndexOf('.');
        if (firstDot <= 0 || firstDot == normalized.Length - 1)
        {
            return null;
        }

        var prefix = normalized[..firstDot];
        var suffix = TryExtractType2Suffix(normalized);
        if (suffix is null)
        {
            return null;
        }

        return new Type2SearchKey(prefix, suffix);
    }

    private static string? TryExtractType2Suffix(string normalized)
    {
        string[] suffixPatterns =
        [
            @"0\d{2}\.\d{3}",
            @"0\d{2}\.\d{2}",
            @"0\d\.\d{3}",
            @"0\d{2}",
            @"0\d"
        ];

        foreach (var suffixPattern in suffixPatterns)
        {
            var match = Regex.Match(normalized, $@"({suffixPattern})$", RegexOptions.CultureInvariant);
            if (match.Success)
            {
                return match.Groups[1].Value;
            }
        }

        return null;
    }

    private readonly record struct Type2SearchKey(string Prefix, string Suffix);

    private static IReadOnlyList<IndexedFileDto> ApplyType3Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files)
    {
        var detailKey = ExtractType3SearchKey(detailName);
        if (detailKey is null)
        {
            return [];
        }

        var key = detailKey.Value;

        return files
            .Where(file =>
            {
                var fileKey = ExtractType3SearchKey(Path.GetFileNameWithoutExtension(file.FileName));
                if (fileKey is null)
                {
                    return false;
                }

                var candidate = fileKey.Value;

                if (!string.Equals(candidate.Prefix, key.Prefix, StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                if (!string.Equals(candidate.Suffix, key.Suffix, StringComparison.Ordinal))
                {
                    return false;
                }

                if (!string.Equals(candidate.Revision, key.Revision, StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                return key.RestContainsSpecialSymbols
                    ? candidate.RestContainsSpecialSymbols
                    : !candidate.RestContainsSpecialSymbols;
            })
            .ToList();
    }
    private static IReadOnlyList<IndexedFileDto> ApplyType4Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files) => FindExactByFileName(detailName, files);
    private static IReadOnlyList<IndexedFileDto> ApplyType5Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files) => FindExactByFileName(detailName, files);

    private static Type3SearchKey? ExtractType3SearchKey(string value)
    {
        var normalized = value.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var firstDot = normalized.IndexOf('.');
        if (firstDot <= 0 || firstDot == normalized.Length - 1)
        {
            return null;
        }

        var prefix = normalized[..firstDot];
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return null;
        }

        var afterPrefix = normalized[(firstDot + 1)..];

        string[] suffixPatterns =
        [
            @"\d{3}\.\d{3}",
            @"\d{3}\.\d{2}",
            @"\d{2}\.\d{3}",
            @"\d{3}",
            @"\d{2}"
        ];

        foreach (var suffixPattern in suffixPatterns)
        {
            var match = Regex.Match(
                afterPrefix,
                $@"(^|\.)(?<suffix>{suffixPattern})(?<revision>\.[Rr](?:\.\d+(?:\.\d+)?|\d+(?:\.\d+)?))?(?<trash>-.*)?$",
                RegexOptions.CultureInvariant);

            if (!match.Success)
            {
                continue;
            }

            var suffix = match.Groups["suffix"].Value;
            var revisionGroup = match.Groups["revision"].Value;
            var revision = string.IsNullOrWhiteSpace(revisionGroup)
                ? null
                : revisionGroup[1..];

            var rest = match.Index == 0
                ? string.Empty
                : afterPrefix[..match.Index];

            return new Type3SearchKey(
                prefix,
                rest,
                suffix,
                revision,
                ContainsType3RestSpecialSymbol(rest));
        }

        return null;
    }

    private static bool ContainsType3RestSpecialSymbol(string rest)
    {
        return rest.Contains('x', StringComparison.OrdinalIgnoreCase)
               || rest.Contains('-');
    }

    private readonly record struct Type3SearchKey(
        string Prefix,
        string Rest,
        string Suffix,
        string? Revision,
        bool RestContainsSpecialSymbols);

    private static string? ResolveColumnKey(IReadOnlyList<VerifyRowDto> rows, string containsText)
    {
        var first = rows.FirstOrDefault();
        if (first is null)
        {
            return null;
        }

        return first.Values.Keys.FirstOrDefault(key => key.Contains(containsText, StringComparison.OrdinalIgnoreCase));
    }
}
