using System.Net;

namespace WindowsIndexer.Worker;

public sealed class PreviewGatewayWorker : BackgroundService
{
    private readonly ILogger<PreviewGatewayWorker> _logger;
    private readonly IndexerOptions _options;
    private readonly string[] _allowedRoots;
    private HttpListener? _listener;

    public PreviewGatewayWorker(ILogger<PreviewGatewayWorker> logger, Microsoft.Extensions.Options.IOptions<IndexerOptions> options)
    {
        _logger = logger;
        _options = options.Value;

        var configuredRoots = _options.PreviewAllowedRoots ?? [];
        _allowedRoots = configuredRoots
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Select(root => Path.GetFullPath(root))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (_allowedRoots.Length == 0)
        {
            _allowedRoots = [Path.GetFullPath(_options.ScanRoot)];
        }
    }

    public override Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.EnablePreviewGateway)
        {
            _logger.LogInformation("Preview gateway is disabled.");
            return Task.CompletedTask;
        }

        var prefix = EnsurePrefix(_options.PreviewGatewayPrefix);
        _listener = new HttpListener();
        _listener.Prefixes.Add(prefix);
        _listener.Start();

        _logger.LogInformation("Preview gateway started on {Prefix}. Allowed roots: {Roots}", prefix, string.Join(", ", _allowedRoots));
        return base.StartAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.EnablePreviewGateway || _listener is null)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            HttpListenerContext? context = null;

            try
            {
                var contextTask = _listener.GetContextAsync();
                var completedTask = await Task.WhenAny(contextTask, Task.Delay(Timeout.Infinite, stoppingToken));

                if (completedTask != contextTask)
                {
                    break;
                }

                context = contextTask.Result;
                _ = Task.Run(() => HandleRequestAsync(context, stoppingToken), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (HttpListenerException ex) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogDebug(ex, "Preview gateway listener stopped due to cancellation.");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Preview gateway failed to accept request.");
                if (context is not null)
                {
                    await WriteErrorAsync(context.Response, HttpStatusCode.InternalServerError, "Internal server error.");
                }
            }
        }
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        if (_listener is not null)
        {
            _listener.Stop();
            _listener.Close();
            _listener = null;
        }

        return base.StopAsync(cancellationToken);
    }

    private async Task HandleRequestAsync(HttpListenerContext context, CancellationToken ct)
    {
        var request = context.Request;
        var response = context.Response;

        try
        {
            AddCorsHeaders(response);

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = (int)HttpStatusCode.NoContent;
                response.Close();
                return;
            }

            if (!IsAuthorized(request))
            {
                await WriteErrorAsync(response, HttpStatusCode.Unauthorized, "Unauthorized.");
                return;
            }

            var route = request.Url?.AbsolutePath?.TrimEnd('/') ?? string.Empty;
            if (string.Equals(route, "/health", StringComparison.OrdinalIgnoreCase))
            {
                await WriteJsonAsync(response, "{\"status\":\"ok\"}");
                return;
            }

            if (!string.Equals(route, "/pdf", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(route, "/document", StringComparison.OrdinalIgnoreCase))
            {
                await WriteErrorAsync(response, HttpStatusCode.NotFound, "Route not found.");
                return;
            }

            var resolvedPath = ResolvePath(request);
            _logger.LogInformation("Preview request received. Raw path='{RawPath}', relativePath='{RelativePath}', resolvedPath='{ResolvedPath}'",
                request.QueryString["path"] ?? string.Empty,
                request.QueryString["relativePath"] ?? string.Empty,
                resolvedPath ?? string.Empty);

            if (string.IsNullOrWhiteSpace(resolvedPath))
            {
                await WriteErrorAsync(response, HttpStatusCode.BadRequest, "Query parameter 'path' or 'relativePath' is required.");
                return;
            }

            if (!IsUnderAllowedRoot(resolvedPath))
            {
                await WriteErrorAsync(response, HttpStatusCode.Forbidden, "Requested path is outside allowed roots.");
                return;
            }

            if (!File.Exists(resolvedPath))
            {
                await WriteErrorAsync(response, HttpStatusCode.NotFound, $"File not found: {resolvedPath}");
                return;
            }

            response.StatusCode = (int)HttpStatusCode.OK;
            response.ContentType = GetContentTypeByExtension(Path.GetExtension(resolvedPath));
            response.AddHeader("Content-Disposition", $"inline; filename=\"{Path.GetFileName(resolvedPath)}\"");

            await using var stream = File.OpenRead(resolvedPath);
            response.ContentLength64 = stream.Length;
            await stream.CopyToAsync(response.OutputStream, ct);
            response.OutputStream.Close();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle preview request.");
            if (response.OutputStream.CanWrite)
            {
                await WriteErrorAsync(response, HttpStatusCode.InternalServerError, "Failed to process request.");
            }
        }
    }

    private string? ResolvePath(HttpListenerRequest request)
    {
        var rawAbsolutePath = request.QueryString["path"];
        var rawRelativePath = request.QueryString["relativePath"];

        if (!string.IsNullOrWhiteSpace(rawRelativePath))
        {
            var normalizedRelative = rawRelativePath.Trim().Trim('"').TrimStart('\\', '/');
            if (string.IsNullOrWhiteSpace(normalizedRelative))
            {
                return null;
            }

            var baseRoot = Path.GetFullPath(_options.ScanRoot);
            return Path.GetFullPath(Path.Combine(baseRoot, normalizedRelative));
        }

        if (string.IsNullOrWhiteSpace(rawAbsolutePath))
        {
            return null;
        }

        var normalized = rawAbsolutePath.Trim().Trim('"');

        if (Uri.TryCreate(normalized, UriKind.Absolute, out var uri) && uri.IsFile)
        {
            normalized = uri.LocalPath;
        }

        if (normalized.StartsWith("\\\\?\\", StringComparison.Ordinal))
        {
            normalized = normalized[4..];
        }

        return Path.GetFullPath(normalized);
    }

    private bool IsUnderAllowedRoot(string fullPath)
    {
        return _allowedRoots.Any(root => fullPath.StartsWith(root, StringComparison.OrdinalIgnoreCase));
    }

    private bool IsAuthorized(HttpListenerRequest request)
    {
        if (string.IsNullOrWhiteSpace(_options.PreviewApiKey))
        {
            return true;
        }

        var expected = _options.PreviewApiKey;
        var fromHeader = request.Headers["X-Preview-Key"];
        var fromQuery = request.QueryString["key"];

        return string.Equals(expected, fromHeader, StringComparison.Ordinal)
            || string.Equals(expected, fromQuery, StringComparison.Ordinal);
    }

    private void AddCorsHeaders(HttpListenerResponse response)
    {
        var allowedOrigin = string.IsNullOrWhiteSpace(_options.PreviewAllowedOrigin)
            ? "*"
            : _options.PreviewAllowedOrigin;

        response.AddHeader("Access-Control-Allow-Origin", allowedOrigin);
        response.AddHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        response.AddHeader("Access-Control-Allow-Headers", "Content-Type, X-Preview-Key");
    }

    private static string EnsurePrefix(string? rawPrefix)
    {
        var prefix = string.IsNullOrWhiteSpace(rawPrefix)
            ? "http://+:5001/"
            : rawPrefix.Trim();

        if (!prefix.EndsWith('/'))
        {
            prefix += "/";
        }

        return prefix;
    }

    private static string GetContentTypeByExtension(string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".dxf" => "image/vnd.dxf",
            _ => "application/octet-stream"
        };
    }

    private static async Task WriteJsonAsync(HttpListenerResponse response, string payload)
    {
        response.StatusCode = (int)HttpStatusCode.OK;
        response.ContentType = "application/json; charset=utf-8";
        await using var writer = new StreamWriter(response.OutputStream);
        await writer.WriteAsync(payload);
        await writer.FlushAsync();
        response.Close();
    }

    private static async Task WriteErrorAsync(HttpListenerResponse response, HttpStatusCode statusCode, string message)
    {
        response.StatusCode = (int)statusCode;
        response.ContentType = "text/plain; charset=utf-8";
        await using var writer = new StreamWriter(response.OutputStream);
        await writer.WriteAsync(message);
        await writer.FlushAsync();
        response.Close();
    }
}
