using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using WindowsIndexer.Worker;

var configPath = args.Length > 0 ? args[0] : "./config.worker.json";
if (!File.Exists(configPath))
{
    throw new FileNotFoundException($"Config file not found: {configPath}");
}

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
var configJson = await ReadConfigJsonAsync(configPath);
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
    ClearEndpoint = parsed.ClearEndpoint,
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
    IncludeExtensions = parsed.IncludeExtensions,
    EnablePreviewGateway = parsed.EnablePreviewGateway,
    PreviewGatewayPrefix = parsed.PreviewGatewayPrefix,
    PreviewAllowedRoots = parsed.PreviewAllowedRoots,
    PreviewAllowedOrigin = parsed.PreviewAllowedOrigin,
    PreviewApiKey = parsed.PreviewApiKey
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
        services.AddHostedService<PreviewGatewayWorker>();
    })
    .Build();

await host.RunAsync();

static async Task<string> ReadConfigJsonAsync(string configPath)
{
    var bytes = await File.ReadAllBytesAsync(configPath);

    // Сначала строго проверяем UTF (без тихой замены символов),
    // затем пробуем cp1251 для старых Windows-конфигов в ANSI.
    foreach (var encoding in GetCandidateEncodings(bytes))
    {
        try
        {
            return encoding.GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            // Пробуем следующую кодировку.
        }
    }

    throw new InvalidOperationException(
        $"Cannot decode config file '{configPath}'. Save it in UTF-8 (recommended) or Windows-1251.");
}

static IEnumerable<Encoding> GetCandidateEncodings(byte[] bytes)
{
    if (HasUtf8Bom(bytes))
    {
        yield return new UTF8Encoding(encoderShouldEmitUTF8Identifier: true, throwOnInvalidBytes: true);
        yield break;
    }

    if (HasUtf16LeBom(bytes))
    {
        yield return new UnicodeEncoding(bigEndian: false, byteOrderMark: true, throwOnInvalidBytes: true);
        yield break;
    }

    if (HasUtf16BeBom(bytes))
    {
        yield return new UnicodeEncoding(bigEndian: true, byteOrderMark: true, throwOnInvalidBytes: true);
        yield break;
    }

    yield return new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
    yield return Encoding.GetEncoding(1251, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
}

static bool HasUtf8Bom(byte[] bytes)
    => bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF;

static bool HasUtf16LeBom(byte[] bytes)
    => bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE;

static bool HasUtf16BeBom(byte[] bytes)
    => bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF;
