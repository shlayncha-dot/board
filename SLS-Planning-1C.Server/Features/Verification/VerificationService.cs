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

    public VerificationService(IFileIndexStore fileIndexStore)
    {
        _fileIndexStore = fileIndexStore;
    }

    public VerificationResponse Verify(VerificationRequest request)
    {
        var allIndexedFiles = _fileIndexStore.GetAllIndexedFiles();
        var dxfFiles = allIndexedFiles.Where(f => string.Equals(f.Extension, ".dxf", StringComparison.OrdinalIgnoreCase)).ToList();
        var pdfFiles = allIndexedFiles.Where(f => string.Equals(f.Extension, ".pdf", StringComparison.OrdinalIgnoreCase)).ToList();

        var designationColumn = ResolveColumnKey(request.Rows, "обознач");
        var nameColumn = ResolveColumnKey(request.Rows, "наимен");
        var typeColumn = ResolveColumnKey(request.Rows, "тип");

        var dxfIssues = VerifyDxf(request.Rows, designationColumn, typeColumn, dxfFiles);
        var pdfIssues = VerifyPdf(request.Rows, designationColumn, nameColumn, typeColumn, request.TypeRules, pdfFiles);

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
        IReadOnlyList<IndexedFileDto> dxfFiles)
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
            AddIssues(row.RowId, detailName, found, issues);
        }

        return issues;
    }

    private static bool IsAllowedDetailType(string detailType)
    {
        var normalized = detailType.Trim().ToLowerInvariant();
        return AllowedDetailTypes.Contains(normalized);
    }

    private static List<VerificationIssueDto> VerifyPdf(
        IReadOnlyList<VerifyRowDto> rows,
        string? designationColumn,
        string? nameColumn,
        string? typeColumn,
        IReadOnlyList<VerificationTypeRuleDto> typeRules,
        IReadOnlyList<IndexedFileDto> pdfFiles)
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

            AddIssues(row.RowId, ResolveDisplayName(row, nameColumn, detailName), found, issues);
        }

        return issues;
    }

    private static string ResolveDisplayName(VerifyRowDto row, string? nameColumn, string fallback)
    {
        if (nameColumn is not null && row.Values.TryGetValue(nameColumn, out var value) && !string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        return fallback;
    }

    private static void AddIssues(string rowId, string detailName, IReadOnlyList<IndexedFileDto> found, ICollection<VerificationIssueDto> issues)
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
            Paths = found.Select(x => x.RelativePath).ToList()
        });
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
            .Split(new[] { ',', ';', '\n', '\r', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

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
        var dashIndex = normalized.IndexOf('-');
        if (dashIndex >= 0)
        {
            normalized = normalized[..dashIndex].Trim();
        }

        return normalized;
    }

    // Заглушки для дальнейшей детализации.
    private static IReadOnlyList<IndexedFileDto> ApplyType2Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files) => FindExactByFileName(detailName, files);
    private static IReadOnlyList<IndexedFileDto> ApplyType3Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files) => FindExactByFileName(detailName, files);
    private static IReadOnlyList<IndexedFileDto> ApplyType4Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files) => FindExactByFileName(detailName, files);
    private static IReadOnlyList<IndexedFileDto> ApplyType5Algorithm(string detailName, IReadOnlyList<IndexedFileDto> files) => FindExactByFileName(detailName, files);

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
