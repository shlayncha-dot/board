using System.Text.Json;

namespace SLS_Planning_1C.Server.Features.FileIndexing;

public interface IFileIndexStore
{
    FileIndexSyncResponse UpsertSnapshot(FileIndexSyncRequest request);
    IReadOnlyList<IndexedFileDto> GetAllIndexedFiles();
}

public sealed class FileIndexStore : IFileIndexStore
{
    private sealed class PendingSnapshotUpload
    {
        public required string MachineId { get; init; }
        public required string RootPath { get; init; }
        public required string SnapshotHash { get; init; }
        public required int TotalChunks { get; init; }
        public DateTime CreatedAtUtc { get; } = DateTime.UtcNow;
        public Dictionary<int, IReadOnlyList<IndexedFileDto>> Chunks { get; } = new();

        public int ReceivedFileCount => Chunks.Values.Sum(c => c.Count);
    }

    private static readonly TimeSpan PendingUploadTtl = TimeSpan.FromMinutes(20);

    private readonly object _sync = new();
    private readonly string _storagePath;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly Dictionary<string, PendingSnapshotUpload> _pendingUploadsByMachine = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, FileIndexSnapshot> _snapshotsByMachine = new(StringComparer.OrdinalIgnoreCase);

    public FileIndexStore(IHostEnvironment env)
    {
        var dataDir = Path.Combine(env.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDir);
        _storagePath = Path.Combine(dataDir, "file-index-snapshots.json");
        LoadFromDisk();
    }

    public FileIndexSyncResponse UpsertSnapshot(FileIndexSyncRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        lock (_sync)
        {
            PurgeExpiredPendingUploads();

            var chunkIndex = request.ChunkIndex ?? 1;
            var totalChunks = request.TotalChunks ?? 1;

            if (chunkIndex < 1 || totalChunks < 1 || chunkIndex > totalChunks)
            {
                throw new InvalidOperationException("Неверные данные chunk-загрузки.");
            }

            if (totalChunks == 1)
            {
                return UpsertCompleteSnapshot(request.MachineId, request.RootPath, request.SnapshotHash, request.Files);
            }

            var pending = GetOrCreatePendingUpload(request, totalChunks);
            pending.Chunks[chunkIndex] = request.Files;

            if (pending.Chunks.Count < totalChunks)
            {
                return new FileIndexSyncResponse
                {
                    Updated = false,
                    FileCount = pending.ReceivedFileCount,
                    UpdatedAtUtc = DateTime.UtcNow
                };
            }

            var mergedFiles = Enumerable.Range(1, totalChunks)
                .SelectMany(index => pending.Chunks[index])
                .ToList();

            _pendingUploadsByMachine.Remove(request.MachineId);
            return UpsertCompleteSnapshot(request.MachineId, request.RootPath, request.SnapshotHash, mergedFiles);
        }
    }

    public IReadOnlyList<IndexedFileDto> GetAllIndexedFiles()
    {
        lock (_sync)
        {
            return _snapshotsByMachine.Values
                .SelectMany(s => s.Files)
                .ToList();
        }
    }

    private FileIndexSyncResponse UpsertCompleteSnapshot(
        string machineId,
        string rootPath,
        string snapshotHash,
        IReadOnlyList<IndexedFileDto> files)
    {
        if (_snapshotsByMachine.TryGetValue(machineId, out var existing)
            && string.Equals(existing.SnapshotHash, snapshotHash, StringComparison.Ordinal))
        {
            return new FileIndexSyncResponse
            {
                Updated = false,
                FileCount = existing.Files.Count,
                UpdatedAtUtc = existing.UpdatedAtUtc
            };
        }

        var snapshot = new FileIndexSnapshot
        {
            MachineId = machineId,
            RootPath = rootPath,
            SnapshotHash = snapshotHash,
            Files = files,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _snapshotsByMachine[machineId] = snapshot;
        PersistToDisk();

        return new FileIndexSyncResponse
        {
            Updated = true,
            FileCount = snapshot.Files.Count,
            UpdatedAtUtc = snapshot.UpdatedAtUtc
        };
    }

    private PendingSnapshotUpload GetOrCreatePendingUpload(FileIndexSyncRequest request, int totalChunks)
    {
        if (_pendingUploadsByMachine.TryGetValue(request.MachineId, out var existing)
            && string.Equals(existing.SnapshotHash, request.SnapshotHash, StringComparison.Ordinal)
            && string.Equals(existing.RootPath, request.RootPath, StringComparison.Ordinal)
            && existing.TotalChunks == totalChunks)
        {
            return existing;
        }

        var pending = new PendingSnapshotUpload
        {
            MachineId = request.MachineId,
            RootPath = request.RootPath,
            SnapshotHash = request.SnapshotHash,
            TotalChunks = totalChunks
        };

        _pendingUploadsByMachine[request.MachineId] = pending;
        return pending;
    }

    private void PurgeExpiredPendingUploads()
    {
        var now = DateTime.UtcNow;
        var expiredMachineIds = _pendingUploadsByMachine
            .Where(item => now - item.Value.CreatedAtUtc > PendingUploadTtl)
            .Select(item => item.Key)
            .ToList();

        foreach (var machineId in expiredMachineIds)
        {
            _pendingUploadsByMachine.Remove(machineId);
        }
    }

    private void LoadFromDisk()
    {
        if (!File.Exists(_storagePath))
        {
            return;
        }

        var json = File.ReadAllText(_storagePath);
        var loaded = JsonSerializer.Deserialize<Dictionary<string, FileIndexSnapshot>>(json, _jsonOptions);
        if (loaded is not null)
        {
            _snapshotsByMachine = loaded;
        }
    }

    private void PersistToDisk()
    {
        var json = JsonSerializer.Serialize(_snapshotsByMachine, _jsonOptions);
        File.WriteAllText(_storagePath, json);
    }
}
