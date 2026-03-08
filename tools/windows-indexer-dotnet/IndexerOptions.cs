namespace WindowsIndexer.Worker;

public sealed class IndexerOptions
{
    public required string ServerUrl { get; init; }
    public string SyncEndpoint { get; init; } = "/api/file-index/sync";
    public string SyncDeltaEndpoint { get; init; } = "/api/file-index/sync-delta";
    public string ClearEndpoint { get; init; } = "/api/file-index/clear";
    public required string ScanRoot { get; init; }
    public int ScanIntervalSeconds { get; init; } = 30;
    public required string MachineId { get; init; }
    public int MaxPayloadBytes { get; init; } = 800_000;
    public int ChunkMetadataOverheadBytes { get; init; } = 512;
    public int RequestTimeoutSeconds { get; init; } = 30;
    public int RetryCount { get; init; } = 3;
    public int RetryDelaySeconds { get; init; } = 3;
    public bool EnableDeltaSync { get; init; } = true;
    public bool EmitCycleLogs { get; init; } = true;
    public string StateDbFileName { get; init; } = ".indexer-state.db";
    public AuthOptions? Auth { get; init; }
    public IReadOnlyList<string>? IncludeExtensions { get; init; }

    // Embedded preview gateway settings
    public bool EnablePreviewGateway { get; init; } = false;
    public string PreviewGatewayPrefix { get; init; } = "http://+:5001/";
    public IReadOnlyList<string>? PreviewAllowedRoots { get; init; }
    public string? PreviewAllowedOrigin { get; init; }
    public string? PreviewApiKey { get; init; }
}

public sealed class AuthOptions
{
    public string? ApiKeyHeader { get; init; }
    public string? ApiKey { get; init; }
    public string? Username { get; init; }
    public string? Password { get; init; }
}
