namespace SLS_Planning_1C.Server.Features.FileIndexing;

public sealed class IndexedFileDto
{
    public required string FileName { get; init; }
    public required string RelativePath { get; init; }
    public required string Extension { get; init; }
    public DateTime LastWriteTimeUtc { get; init; }
    public long SizeBytes { get; init; }
}

public sealed class FileIndexSyncRequest
{
    public required string MachineId { get; init; }
    public required string RootPath { get; init; }
    public required string SnapshotHash { get; init; }
    public required IReadOnlyList<IndexedFileDto> Files { get; init; }
    public int? ChunkIndex { get; init; }
    public int? TotalChunks { get; init; }
}

public sealed class FileIndexSyncResponse
{
    public bool Updated { get; init; }
    public int FileCount { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
    public bool IsPartial { get; init; }
    public int ReceivedChunks { get; init; }
    public int TotalChunks { get; init; }
}

public sealed class FileIndexSnapshot
{
    public required string MachineId { get; init; }
    public required string RootPath { get; init; }
    public required string SnapshotHash { get; init; }
    public required IReadOnlyList<IndexedFileDto> Files { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
}
