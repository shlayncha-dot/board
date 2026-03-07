using System.Text.Json;

namespace SLS_Planning_1C.Server.Features.FileIndexing;

public interface IFileIndexStore
{
    FileIndexSyncResponse UpsertSnapshot(FileIndexSyncRequest request);
    FileIndexSyncResponse ApplyDelta(FileIndexDeltaSyncRequest request);
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
                return UpsertCompleteSnapshot(request.MachineId, request.EffectiveRootPath, request.SnapshotHash, request.Files);
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
            return UpsertCompleteSnapshot(request.MachineId, request.EffectiveRootPath, request.SnapshotHash, mergedFiles);
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

    public FileIndexSyncResponse ApplyDelta(FileIndexDeltaSyncRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.MachineId))
        {
            throw new InvalidOperationException("MachineId is required.");
        }

        if (string.IsNullOrWhiteSpace(request.EffectiveRootPath))
        {
            throw new InvalidOperationException("RootPath/ScanRoot is required.");
        }

        if (string.IsNullOrWhiteSpace(request.BaseSnapshotHash) || string.IsNullOrWhiteSpace(request.NewSnapshotHash))
        {
            throw new InvalidOperationException("BaseSnapshotHash and NewSnapshotHash are required.");
        }

        var deletedRelativePaths = request.DeletedRelativePaths ?? [];
        var addedOrUpdatedFiles = request.AddedOrUpdatedFiles ?? [];

        lock (_sync)
        {
            if (!_snapshotsByMachine.TryGetValue(request.MachineId, out var existingSnapshot))
            {
                throw new InvalidOperationException("Базовый snapshot для машины не найден. Выполните полную синхронизацию.");
            }

            if (!string.Equals(existingSnapshot.SnapshotHash, request.BaseSnapshotHash, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Конфликт версий snapshot. Требуется полная пересинхронизация.");
            }

            if (string.Equals(request.BaseSnapshotHash, request.NewSnapshotHash, StringComparison.Ordinal))
            {
                return new FileIndexSyncResponse
                {
                    Updated = false,
                    FileCount = existingSnapshot.Files.Count,
                    UpdatedAtUtc = existingSnapshot.UpdatedAtUtc
                };
            }

            var mergedByPath = existingSnapshot.Files
                .ToDictionary(file => file.RelativePath, StringComparer.OrdinalIgnoreCase);

            foreach (var deletedPath in deletedRelativePaths)
            {
                if (!string.IsNullOrWhiteSpace(deletedPath))
                {
                    mergedByPath.Remove(deletedPath);
                }
            }

            foreach (var file in addedOrUpdatedFiles)
            {
                if (string.IsNullOrWhiteSpace(file.RelativePath))
                {
                    continue;
                }

                mergedByPath[file.RelativePath] = file;
            }

            var snapshot = new FileIndexSnapshot
            {
                MachineId = request.MachineId,
                RootPath = request.EffectiveRootPath,
                SnapshotHash = request.NewSnapshotHash,
                Files = mergedByPath.Values
                    .OrderBy(file => file.RelativePath, StringComparer.OrdinalIgnoreCase)
                    .Select(NormalizeFile)
                    .ToList(),
                UpdatedAtUtc = DateTime.UtcNow
            };

            _snapshotsByMachine[request.MachineId] = snapshot;
            PersistToDisk();

            return new FileIndexSyncResponse
            {
                Updated = true,
                FileCount = snapshot.Files.Count,
                UpdatedAtUtc = snapshot.UpdatedAtUtc
            };
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
            Files = files.Select(NormalizeFile).ToList(),
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


    private static IndexedFileDto NormalizeFile(IndexedFileDto file)
    {
        return new IndexedFileDto
        {
            FileName = file.FileName,
            RelativePath = file.RelativePath,
            Extension = file.Extension,
            LastWriteTimeUtc = file.LastWriteTimeUtc,
            SizeBytes = file.EffectiveSizeBytes,
            Hash = file.Hash
        };
    }

    private PendingSnapshotUpload GetOrCreatePendingUpload(FileIndexSyncRequest request, int totalChunks)
    {
        if (_pendingUploadsByMachine.TryGetValue(request.MachineId, out var existing)
            && string.Equals(existing.SnapshotHash, request.SnapshotHash, StringComparison.Ordinal)
            && string.Equals(existing.RootPath, request.EffectiveRootPath, StringComparison.Ordinal)
            && existing.TotalChunks == totalChunks)
        {
            return existing;
        }

        var pending = new PendingSnapshotUpload
        {
            MachineId = request.MachineId,
            RootPath = request.EffectiveRootPath,
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
