using System.Text.Json;

namespace SLS_Planning_1C.Server.Features.FileIndexing;

public interface IFileIndexStore
{
    FileIndexSyncResponse UpsertSnapshot(FileIndexSyncRequest request);
    IReadOnlyList<IndexedFileDto> GetAllIndexedFiles();
}

public sealed class FileIndexStore : IFileIndexStore
{
    private readonly object _sync = new();
    private readonly string _storagePath;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private Dictionary<string, FileIndexSnapshot> _snapshotsByMachine = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, PendingSnapshotUpload> _pendingUploads = new(StringComparer.OrdinalIgnoreCase);

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
            var totalChunks = request.TotalChunks.GetValueOrDefault(1);
            var chunkIndex = request.ChunkIndex.GetValueOrDefault(0);
            if (totalChunks <= 1)
            {
                return UpsertSingleChunk(request);
            }

            if (_snapshotsByMachine.TryGetValue(request.MachineId, out var existing)
                && string.Equals(existing.SnapshotHash, request.SnapshotHash, StringComparison.Ordinal))
            {
                return new FileIndexSyncResponse
                {
                    Updated = false,
                    FileCount = existing.Files.Count,
                    UpdatedAtUtc = existing.UpdatedAtUtc,
                    IsPartial = false,
                    ReceivedChunks = totalChunks,
                    TotalChunks = totalChunks
                };
            }

            if (!_pendingUploads.TryGetValue(request.MachineId, out var pending)
                || !pending.IsSameUpload(request, totalChunks))
            {
                pending = new PendingSnapshotUpload(request.MachineId, request.RootPath, request.SnapshotHash, totalChunks);
                _pendingUploads[request.MachineId] = pending;
            }

            pending.AddChunk(chunkIndex, request.Files);

            if (!pending.IsComplete)
            {
                return new FileIndexSyncResponse
                {
                    Updated = false,
                    FileCount = pending.FileCount,
                    UpdatedAtUtc = DateTime.UtcNow,
                    IsPartial = true,
                    ReceivedChunks = pending.ReceivedChunks,
                    TotalChunks = totalChunks
                };
            }

            var finalizedSnapshot = new FileIndexSnapshot
            {
                MachineId = request.MachineId,
                RootPath = request.RootPath,
                SnapshotHash = request.SnapshotHash,
                Files = pending.GetMergedFiles(),
                UpdatedAtUtc = DateTime.UtcNow
            };

            _pendingUploads.Remove(request.MachineId);
            _snapshotsByMachine[request.MachineId] = finalizedSnapshot;
            PersistToDisk();

            return new FileIndexSyncResponse
            {
                Updated = true,
                FileCount = finalizedSnapshot.Files.Count,
                UpdatedAtUtc = finalizedSnapshot.UpdatedAtUtc,
                IsPartial = false,
                ReceivedChunks = totalChunks,
                TotalChunks = totalChunks
            };
        }
    }

    private FileIndexSyncResponse UpsertSingleChunk(FileIndexSyncRequest request)
    {
        _pendingUploads.Remove(request.MachineId);

        if (_snapshotsByMachine.TryGetValue(request.MachineId, out var existing)
            && string.Equals(existing.SnapshotHash, request.SnapshotHash, StringComparison.Ordinal))
        {
            return new FileIndexSyncResponse
            {
                Updated = false,
                FileCount = existing.Files.Count,
                UpdatedAtUtc = existing.UpdatedAtUtc,
                IsPartial = false,
                ReceivedChunks = 1,
                TotalChunks = 1
            };
        }

        var snapshot = new FileIndexSnapshot
        {
            MachineId = request.MachineId,
            RootPath = request.RootPath,
            SnapshotHash = request.SnapshotHash,
            Files = request.Files,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _snapshotsByMachine[request.MachineId] = snapshot;
        PersistToDisk();

        return new FileIndexSyncResponse
        {
            Updated = true,
            FileCount = snapshot.Files.Count,
            UpdatedAtUtc = snapshot.UpdatedAtUtc,
            IsPartial = false,
            ReceivedChunks = 1,
            TotalChunks = 1
        };
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

    private sealed class PendingSnapshotUpload
    {
        private readonly string _machineId;
        private readonly string _rootPath;
        private readonly string _snapshotHash;
        private readonly int _totalChunks;
        private readonly Dictionary<int, IReadOnlyList<IndexedFileDto>> _chunks = new();

        public PendingSnapshotUpload(string machineId, string rootPath, string snapshotHash, int totalChunks)
        {
            _machineId = machineId;
            _rootPath = rootPath;
            _snapshotHash = snapshotHash;
            _totalChunks = totalChunks;
        }

        public int ReceivedChunks => _chunks.Count;
        public bool IsComplete => _chunks.Count == _totalChunks;
        public int FileCount => _chunks.Values.Sum(c => c.Count);

        public bool IsSameUpload(FileIndexSyncRequest request, int totalChunks)
        {
            return string.Equals(_machineId, request.MachineId, StringComparison.OrdinalIgnoreCase)
                && string.Equals(_rootPath, request.RootPath, StringComparison.Ordinal)
                && string.Equals(_snapshotHash, request.SnapshotHash, StringComparison.Ordinal)
                && _totalChunks == totalChunks;
        }

        public void AddChunk(int chunkIndex, IReadOnlyList<IndexedFileDto> files)
        {
            if (chunkIndex < 0 || chunkIndex >= _totalChunks)
            {
                throw new ArgumentOutOfRangeException(nameof(chunkIndex), "Неверный индекс chunk-пакета.");
            }

            _chunks[chunkIndex] = files;
        }

        public IReadOnlyList<IndexedFileDto> GetMergedFiles()
        {
            return _chunks.OrderBy(p => p.Key)
                .SelectMany(p => p.Value)
                .ToList();
        }
    }
}
