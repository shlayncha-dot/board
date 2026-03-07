using System.Text.Json.Serialization;

namespace SLS_Planning_1C.Server.Features.FileIndexing;

public sealed class IndexedFileDto
{
    public required string FileName { get; init; }
    public required string RelativePath { get; init; }
    public required string Extension { get; init; }
    public DateTime LastWriteTimeUtc { get; init; }

    [JsonPropertyName("sizeBytes")]
    public long? SizeBytes { get; init; }

    [JsonPropertyName("size")]
    public long? Size { get; init; }

    public string? Hash { get; init; }

    [JsonIgnore]
    public long EffectiveSizeBytes => SizeBytes ?? Size ?? 0;
}

public sealed class FileIndexSyncRequest
{
    public required string MachineId { get; init; }

    [JsonPropertyName("rootPath")]
    public string? RootPath { get; init; }

    [JsonPropertyName("scanRoot")]
    public string? ScanRoot { get; init; }

    public required string SnapshotHash { get; init; }
    public required IReadOnlyList<IndexedFileDto> Files { get; init; }
    public int? ChunkIndex { get; init; }
    public int? TotalChunks { get; init; }

    [JsonIgnore]
    public string EffectiveRootPath => !string.IsNullOrWhiteSpace(ScanRoot) ? ScanRoot : RootPath
        ?? throw new InvalidOperationException("RootPath or ScanRoot is required.");
}

public sealed class FileIndexSyncResponse
{
    public bool Updated { get; init; }
    public int FileCount { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
}

public sealed class FileIndexDeltaSyncRequest
{
    public required string MachineId { get; init; }

    [JsonPropertyName("rootPath")]
    public string? RootPath { get; init; }

    [JsonPropertyName("scanRoot")]
    public string? ScanRoot { get; init; }

    public required string BaseSnapshotHash { get; init; }
    public required string NewSnapshotHash { get; init; }
    public required IReadOnlyList<IndexedFileDto> AddedOrUpdatedFiles { get; init; }
    public required IReadOnlyList<string> DeletedRelativePaths { get; init; }

    [JsonIgnore]
    public string EffectiveRootPath => !string.IsNullOrWhiteSpace(ScanRoot) ? ScanRoot : RootPath
        ?? throw new InvalidOperationException("RootPath or ScanRoot is required.");
}

public sealed class FileIndexSnapshot
{
    public required string MachineId { get; init; }
    public required string RootPath { get; init; }
    public required string SnapshotHash { get; init; }
    public required IReadOnlyList<IndexedFileDto> Files { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
}
