using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace WindowsIndexer.Worker;

public sealed class IndexerWorker : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ILogger<IndexerWorker> _logger;
    private readonly IndexerOptions _options;
    private readonly StateRepository _state;
    private readonly HttpClient _httpClient;
    private readonly string _scanRoot;
    private readonly string _syncUrl;
    private readonly string _syncDeltaUrl;
    private readonly HashSet<string> _includeExtensions;

    public IndexerWorker(
        ILogger<IndexerWorker> logger,
        IOptions<IndexerOptions> options,
        StateRepository state,
        IHttpClientFactory httpClientFactory)
    {
        _logger = logger;
        _options = options.Value;
        _state = state;
        _httpClient = httpClientFactory.CreateClient(nameof(IndexerWorker));

        _scanRoot = Path.GetFullPath(_options.ScanRoot);
        _syncUrl = BuildUrl(_options.ServerUrl, _options.SyncEndpoint);
        _syncDeltaUrl = BuildUrl(_options.ServerUrl, _options.SyncDeltaEndpoint);

        _includeExtensions = (_options.IncludeExtensions ?? [])
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.StartsWith('.') ? x : $".{x}")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        ConfigureAuth();

        _logger.LogInformation("Indexer worker started. ScanRoot={ScanRoot}, Sync={SyncUrl}, Delta={DeltaUrl}", _scanRoot, _syncUrl, _syncDeltaUrl);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_options.EmitCycleLogs)
                {
                    _logger.LogInformation("Scan started...");
                }

                var currentFiles = ScanFiles();
                var currentHash = ComputeSnapshotHash(currentFiles);
                var previousHash = _state.GetLastSnapshotHash();

                if (string.Equals(previousHash, currentHash, StringComparison.Ordinal))
                {
                    if (_options.EmitCycleLogs)
                    {
                        _logger.LogInformation("No changes detected.");
                    }
                }
                else
                {
                    await SyncAsync(currentFiles, previousHash, currentHash, stoppingToken);
                    _state.SaveSnapshot(currentHash, currentFiles);
                    _logger.LogInformation("State committed. FileCount={Count}", currentFiles.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Indexer cycle failed.");
            }

            await Task.Delay(TimeSpan.FromSeconds(_options.ScanIntervalSeconds), stoppingToken);
        }
    }

    private List<IndexedFileDto> ScanFiles()
    {
        var result = new List<IndexedFileDto>();
        foreach (var file in Directory.EnumerateFiles(_scanRoot, "*", SearchOption.AllDirectories))
        {
            var info = new FileInfo(file);
            if (_includeExtensions.Count > 0 && !_includeExtensions.Contains(info.Extension))
            {
                continue;
            }

            var relativePath = Path.GetRelativePath(_scanRoot, info.FullName).Replace('/', '\\');
            result.Add(new IndexedFileDto(
                info.Name,
                relativePath,
                info.Extension.ToLowerInvariant(),
                info.LastWriteTimeUtc,
                info.Length));
        }

        if (_options.EmitCycleLogs)
        {
            _logger.LogInformation("Files discovered: {Count}", result.Count);
        }

        return result;
    }

    private async Task SyncAsync(List<IndexedFileDto> files, string? previousHash, string currentHash, CancellationToken ct)
    {
        var deltaSent = false;

        if (_options.EnableDeltaSync && !string.IsNullOrWhiteSpace(previousHash))
        {
            var previous = _state.LoadFilesByPath();
            var delta = BuildDelta(previous, files, previousHash!, currentHash);
            var deltaBytes = GetPayloadSizeBytes(delta);

            if (deltaBytes <= _options.MaxPayloadBytes)
            {
                _logger.LogInformation("Sending delta: added/updated={Upserted}, deleted={Deleted}", delta.AddedOrUpdatedFiles.Count, delta.DeletedRelativePaths.Count);
                var deltaResponse = await SendWithRetryAsync(_syncDeltaUrl, delta, ct);

                if (deltaResponse.IsSuccessStatusCode)
                {
                    deltaSent = true;
                }
                else if (ShouldFallbackToFull(deltaResponse.StatusCode))
                {
                    _logger.LogWarning("Delta rejected with status {StatusCode}. Falling back to full sync.", (int)deltaResponse.StatusCode);
                }
                else
                {
                    var body = await deltaResponse.Content.ReadAsStringAsync(ct);
                    throw new HttpRequestException($"Delta sync failed: {(int)deltaResponse.StatusCode} {body}");
                }
            }
            else
            {
                _logger.LogInformation("Delta too large ({Bytes} bytes). Using full sync.", deltaBytes);
            }
        }

        if (!deltaSent)
        {
            await SendFullSyncInChunks(files, currentHash, ct);
        }
    }

    private async Task SendFullSyncInChunks(List<IndexedFileDto> files, string snapshotHash, CancellationToken ct)
    {
        var template = new FileIndexSyncRequest
        {
            MachineId = _options.MachineId,
            RootPath = _scanRoot,
            SnapshotHash = snapshotHash,
            Files = []
        };

        var chunks = SplitIntoChunks(files, template, _options.MaxPayloadBytes, _options.ChunkMetadataOverheadBytes);
        _logger.LogInformation("Sending full sync, chunks={Chunks}", chunks.Count);

        for (var i = 0; i < chunks.Count; i++)
        {
            var request = new FileIndexSyncRequest
            {
                MachineId = template.MachineId,
                RootPath = template.RootPath,
                SnapshotHash = template.SnapshotHash,
                Files = chunks[i],
                ChunkIndex = chunks.Count > 1 ? i + 1 : null,
                TotalChunks = chunks.Count > 1 ? chunks.Count : null
            };

            var response = await SendWithRetryAsync(_syncUrl, request, ct);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(ct);
                throw new HttpRequestException($"Full sync failed on chunk {i + 1}/{chunks.Count}: {(int)response.StatusCode} {body}");
            }

            _logger.LogInformation("Chunk sent {Index}/{Total}, files={Count}", i + 1, chunks.Count, chunks[i].Count);
        }
    }

    private async Task<HttpResponseMessage> SendWithRetryAsync<T>(string url, T payload, CancellationToken ct)
    {
        for (var attempt = 1; attempt <= _options.RetryCount + 1; attempt++)
        {
            using var content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");
            try
            {
                var response = await _httpClient.PostAsync(url, content, ct);
                if (response.IsSuccessStatusCode || attempt > _options.RetryCount)
                {
                    return response;
                }

                _logger.LogWarning("Request failed with status {StatusCode}, attempt {Attempt}/{Total}", (int)response.StatusCode, attempt, _options.RetryCount + 1);
            }
            catch (Exception ex) when (attempt <= _options.RetryCount)
            {
                _logger.LogWarning(ex, "Request attempt {Attempt}/{Total} failed", attempt, _options.RetryCount + 1);
            }

            await Task.Delay(TimeSpan.FromSeconds(_options.RetryDelaySeconds), ct);
        }

        throw new InvalidOperationException("Unexpected retry state.");
    }

    private FileIndexDeltaSyncRequest BuildDelta(
        Dictionary<string, IndexedFileDto> previousByPath,
        IReadOnlyList<IndexedFileDto> currentFiles,
        string baseSnapshotHash,
        string newSnapshotHash)
    {
        var currentByPath = currentFiles.ToDictionary(f => f.RelativePath, StringComparer.OrdinalIgnoreCase);

        var addedOrUpdated = currentByPath
            .Where(kv => !previousByPath.TryGetValue(kv.Key, out var prev) || prev.Fingerprint != kv.Value.Fingerprint)
            .Select(kv => kv.Value)
            .ToList();

        var deleted = previousByPath.Keys
            .Where(path => !currentByPath.ContainsKey(path))
            .ToList();

        return new FileIndexDeltaSyncRequest
        {
            MachineId = _options.MachineId,
            RootPath = _scanRoot,
            BaseSnapshotHash = baseSnapshotHash,
            NewSnapshotHash = newSnapshotHash,
            AddedOrUpdatedFiles = addedOrUpdated,
            DeletedRelativePaths = deleted
        };
    }

    private static List<IReadOnlyList<IndexedFileDto>> SplitIntoChunks(
        IReadOnlyList<IndexedFileDto> files,
        FileIndexSyncRequest template,
        int maxPayloadBytes,
        int chunkMetadataOverheadBytes)
    {
        var maxBytes = maxPayloadBytes - Math.Max(0, chunkMetadataOverheadBytes);
        if (maxBytes <= 0)
        {
            throw new InvalidOperationException("maxPayloadBytes must be greater than chunkMetadataOverheadBytes");
        }

        var chunks = new List<IReadOnlyList<IndexedFileDto>>();
        var current = new List<IndexedFileDto>();

        foreach (var file in files)
        {
            current.Add(file);
            var candidate = new FileIndexSyncRequest
            {
                MachineId = template.MachineId,
                RootPath = template.RootPath,
                SnapshotHash = template.SnapshotHash,
                Files = current
            };

            if (GetPayloadSizeBytes(candidate) > maxBytes)
            {
                if (current.Count == 1)
                {
                    throw new InvalidOperationException("Single file exceeds max payload size.");
                }

                current.RemoveAt(current.Count - 1);
                chunks.Add(current.ToList());
                current = [file];
            }
        }

        if (current.Count > 0)
        {
            chunks.Add(current);
        }

        return chunks;
    }

    private static string ComputeSnapshotHash(IReadOnlyList<IndexedFileDto> files)
    {
        var lines = files
            .OrderBy(f => f.RelativePath, StringComparer.OrdinalIgnoreCase)
            .Select(f => f.Fingerprint);

        var bytes = Encoding.UTF8.GetBytes(string.Join('\n', lines));
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static int GetPayloadSizeBytes<T>(T payload)
        => Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(payload, JsonOptions));

    private static bool ShouldFallbackToFull(HttpStatusCode statusCode)
        => statusCode == HttpStatusCode.BadRequest
           || statusCode == HttpStatusCode.NotFound
           || statusCode == HttpStatusCode.Conflict;

    private static string BuildUrl(string serverUrl, string endpoint)
    {
        var root = serverUrl.TrimEnd('/');
        var path = endpoint.StartsWith('/') ? endpoint : $"/{endpoint}";
        return $"{root}{path}";
    }

    private void ConfigureAuth()
    {
        _httpClient.Timeout = TimeSpan.FromSeconds(_options.RequestTimeoutSeconds);

        if (!string.IsNullOrWhiteSpace(_options.Auth?.ApiKeyHeader) && !string.IsNullOrWhiteSpace(_options.Auth?.ApiKey))
        {
            _httpClient.DefaultRequestHeaders.Remove(_options.Auth.ApiKeyHeader);
            _httpClient.DefaultRequestHeaders.Add(_options.Auth.ApiKeyHeader, _options.Auth.ApiKey);
        }

        if (!string.IsNullOrWhiteSpace(_options.Auth?.Username) && !string.IsNullOrWhiteSpace(_options.Auth?.Password))
        {
            var token = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_options.Auth.Username}:{_options.Auth.Password}"));
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", token);
        }
    }
}
