namespace SLS_Planning_1C.Server.Features.Verification;

public interface IVerificationResultCacheStore
{
    void ReplaceAll(IEnumerable<VerifiedDetailCacheEntry> entries);
    IReadOnlyList<string> GetPdfPaths(string detailName);
    IReadOnlyList<string> GetDxfPaths(string detailName);
    bool HasVerificationSnapshot();
}

public sealed class VerificationResultCacheStore : IVerificationResultCacheStore
{
    private readonly object _sync = new();
    private Dictionary<string, VerifiedDetailCacheEntry> _entries = new(StringComparer.OrdinalIgnoreCase);
    private bool _hasVerificationSnapshot;

    public void ReplaceAll(IEnumerable<VerifiedDetailCacheEntry> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);

        var normalizedEntries = entries
            .Where(entry => !string.IsNullOrWhiteSpace(entry.DetailName))
            .GroupBy(entry => entry.DetailName.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => Merge(group.Key, group))
            .ToDictionary(entry => entry.DetailName, StringComparer.OrdinalIgnoreCase);

        lock (_sync)
        {
            _entries = normalizedEntries;
            _hasVerificationSnapshot = true;
        }
    }

    public bool HasVerificationSnapshot()
    {
        lock (_sync)
        {
            return _hasVerificationSnapshot;
        }
    }

    public IReadOnlyList<string> GetPdfPaths(string detailName)
    {
        return GetPaths(detailName, entry => entry.PdfPaths);
    }

    public IReadOnlyList<string> GetDxfPaths(string detailName)
    {
        return GetPaths(detailName, entry => entry.DxfPaths);
    }

    private IReadOnlyList<string> GetPaths(string detailName, Func<VerifiedDetailCacheEntry, IReadOnlyList<string>> selector)
    {
        var normalized = detailName?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        lock (_sync)
        {
            if (!_entries.TryGetValue(normalized, out var entry))
            {
                return [];
            }

            return selector(entry);
        }
    }

    private static VerifiedDetailCacheEntry Merge(string detailName, IEnumerable<VerifiedDetailCacheEntry> entries)
    {
        var dxfPaths = entries
            .SelectMany(entry => entry.DxfPaths)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var pdfPaths = entries
            .SelectMany(entry => entry.PdfPaths)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new VerifiedDetailCacheEntry
        {
            DetailName = detailName,
            DxfPaths = dxfPaths,
            PdfPaths = pdfPaths
        };
    }
}

public sealed class VerifiedDetailCacheEntry
{
    public required string DetailName { get; init; }
    public required IReadOnlyList<string> DxfPaths { get; init; }
    public required IReadOnlyList<string> PdfPaths { get; init; }
}
