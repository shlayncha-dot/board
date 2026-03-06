using System.Text.Json;
using Microsoft.Extensions.Options;
using WindowsIndexer.Worker;

var configPath = args.Length > 0 ? args[0] : "./config.worker.json";
if (!File.Exists(configPath))
{
    throw new FileNotFoundException($"Config file not found: {configPath}");
}

var configJson = await File.ReadAllTextAsync(configPath);
var parsed = JsonSerializer.Deserialize<IndexerOptions>(configJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))
             ?? throw new InvalidOperationException("Failed to parse config json.");

if (string.IsNullOrWhiteSpace(parsed.ServerUrl)) throw new InvalidOperationException("serverUrl is required.");
if (string.IsNullOrWhiteSpace(parsed.ScanRoot)) throw new InvalidOperationException("scanRoot is required.");
if (string.IsNullOrWhiteSpace(parsed.MachineId)) throw new InvalidOperationException("machineId is required.");

var rootDir = Path.GetDirectoryName(Path.GetFullPath(configPath))!;
var normalizedScanRoot = Path.IsPathRooted(parsed.ScanRoot)
    ? parsed.ScanRoot
    : Path.GetFullPath(Path.Combine(rootDir, parsed.ScanRoot));

var options = new IndexerOptions
{
    ServerUrl = parsed.ServerUrl,
    SyncEndpoint = parsed.SyncEndpoint,
    SyncDeltaEndpoint = parsed.SyncDeltaEndpoint,
    ScanRoot = normalizedScanRoot,
    ScanIntervalSeconds = parsed.ScanIntervalSeconds,
    MachineId = parsed.MachineId,
    MaxPayloadBytes = parsed.MaxPayloadBytes,
    ChunkMetadataOverheadBytes = parsed.ChunkMetadataOverheadBytes,
    RequestTimeoutSeconds = parsed.RequestTimeoutSeconds,
    RetryCount = parsed.RetryCount,
    RetryDelaySeconds = parsed.RetryDelaySeconds,
    EnableDeltaSync = parsed.EnableDeltaSync,
    EmitCycleLogs = parsed.EmitCycleLogs,
    StateDbFileName = parsed.StateDbFileName,
    Auth = parsed.Auth,
    IncludeExtensions = parsed.IncludeExtensions
};

using var host = Host.CreateDefaultBuilder(args)
    .ConfigureServices(services =>
    {
        services.AddSingleton<IOptions<IndexerOptions>>(Options.Create(options));
        services.AddHttpClient(nameof(IndexerWorker));
        services.AddSingleton(_ =>
        {
            var dbPath = Path.IsPathRooted(options.StateDbFileName)
                ? options.StateDbFileName
                : Path.Combine(rootDir, options.StateDbFileName);
            return new StateRepository(dbPath);
        });
        services.AddHostedService<IndexerWorker>();
    })
    .Build();

await host.RunAsync();
