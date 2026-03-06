using System.Text.Json.Serialization;

namespace WindowsIndexer.Worker;

public sealed record IndexedFileDto(
    string FileName,
    string RelativePath,
    string Extension,
    DateTime LastWriteTimeUtc,
    long SizeBytes)
{
    public string Fingerprint => $"{RelativePath}|{SizeBytes}|{Extension}|{LastWriteTimeUtc:O}";
}

public sealed class FileIndexSyncRequest
{
    public required string MachineId { get; init; }
    public required string RootPath { get; init; }
    public required string SnapshotHash { get; init; }
    public required IReadOnlyList<IndexedFileDto> Files { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? ChunkIndex { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? TotalChunks { get; init; }
}

public sealed class FileIndexDeltaSyncRequest
{
    public required string MachineId { get; init; }
    public required string RootPath { get; init; }
    public required string BaseSnapshotHash { get; init; }
    public required string NewSnapshotHash { get; init; }
    public required IReadOnlyList<IndexedFileDto> AddedOrUpdatedFiles { get; init; }
    public required IReadOnlyList<string> DeletedRelativePaths { get; init; }
}
