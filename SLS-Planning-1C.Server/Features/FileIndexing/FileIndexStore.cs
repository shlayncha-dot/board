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
            if (_snapshotsByMachine.TryGetValue(request.MachineId, out var existing)
                && string.Equals(existing.SnapshotHash, request.SnapshotHash, StringComparison.Ordinal))
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
                UpdatedAtUtc = snapshot.UpdatedAtUtc
            };
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
