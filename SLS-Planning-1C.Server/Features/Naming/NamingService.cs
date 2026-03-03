using System.Net;
using System.Security.Authentication;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SLS_Planning_1C.Server.Features.Naming;

public interface INamingService
{
    Task<NamingCheckResponse> CheckAsync(NamingCheckRequest request, CancellationToken cancellationToken);
}

public sealed class NamingService : INamingService
{
    private readonly NamingApiOptions _options;
    private readonly INamingCredentialsStore _credentialsStore;
    private readonly ILogger<NamingService> _logger;

    public NamingService(
        IOptions<NamingApiOptions> options,
        INamingCredentialsStore credentialsStore,
        ILogger<NamingService> logger)
    {
        _options = options.Value;
        _credentialsStore = credentialsStore;
        _logger = logger;
    }

    public async Task<NamingCheckResponse> CheckAsync(NamingCheckRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (request.Items is null || request.Items.Count == 0)
        {
            return new NamingCheckResponse { Results = [] };
        }

        if (string.IsNullOrWhiteSpace(_options.CheckUrl))
        {
            throw new NamingServiceException("Не настроен URL API для проверки нейминга.", HttpStatusCode.ServiceUnavailable);
        }

        var payload = request.Items.Select(item => new { name = item.Name }).ToList();
        var payloadJson = JsonSerializer.Serialize(payload);

        var (responseBody, statusCode) = await ExecuteHttpRequestAsync(payloadJson, cancellationToken);

        if (statusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            throw new NamingServiceException(
                "Внешний сервис нейминга отклонил запрос (401/403). Проверьте логин и пароль 1С в настройках сервера.",
                HttpStatusCode.BadGateway);
        }

        if ((int)statusCode < 200 || (int)statusCode >= 300)
        {
            throw new NamingServiceException($"Сервис Нейминг вернул ошибку {(int)statusCode}.", HttpStatusCode.BadGateway);
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(responseBody);
        }
        catch (JsonException)
        {
            throw new NamingServiceException("Сервис Нейминг вернул ответ в неожиданном формате.", HttpStatusCode.BadGateway);
        }

        using (document)
        {
            var statuses = ExtractStatuses(document.RootElement, request.Items.Count);
            var results = request.Items
                .Select((item, index) =>
                {
                    var status = statuses.ElementAtOrDefault(index) ?? "Not found";
                    var isFound = string.Equals(status, "Found", StringComparison.OrdinalIgnoreCase);

                    return new NamingCheckResultItem
                    {
                        RowId = item.RowId,
                        Name = item.Name,
                        Status = status,
                        IsFound = isFound
                    };
                })
                .ToList();

            return new NamingCheckResponse { Results = results };
        }
    }

    private async Task<(string ResponseBody, HttpStatusCode StatusCode)> ExecuteHttpRequestAsync(
        string payloadJson,
        CancellationToken cancellationToken)
    {
        var handler = new HttpClientHandler
        {
            UseProxy = false,
            Proxy = null,
            ServerCertificateCustomValidationCallback =
                HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
            SslProtocols = SslProtocols.Tls12
        };

        using var httpClient = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(30)
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, _options.CheckUrl)
        {
            Content = new StringContent(payloadJson, Encoding.UTF8, "application/json"),
            Version = HttpVersion.Version11,
            VersionPolicy = HttpVersionPolicy.RequestVersionOrLower
        };

        request.Headers.UserAgent.ParseAdd("PostmanRuntime/7.0");

        var credentials = ResolveCredentials();
        if (credentials is not null)
        {
            var raw = $"{credentials.Value.Username}:{credentials.Value.Password}";
            var encoded = Convert.ToBase64String(Encoding.ASCII.GetBytes(raw));
            request.Headers.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", encoded);
        }

        try
        {
            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

            _logger.LogInformation("Naming API => {Status} {Body}", (int)response.StatusCode, responseBody);
            return (responseBody, response.StatusCode);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex,
                "Naming API HTTP/SSL error. Message={Msg}; Inner={Inner}",
                ex.Message,
                ex.InnerException?.Message);

            throw new NamingServiceException(
                "Ошибка HTTP при обращении к сервису нейминга: " + ex.Message,
                HttpStatusCode.BadGateway,
                ex);
        }
    }

    private (string Username, string Password)? ResolveCredentials()
    {
        if (_credentialsStore.TryGet(out var runtimeCredentials)
            && !string.IsNullOrWhiteSpace(runtimeCredentials.Username)
            && !string.IsNullOrWhiteSpace(runtimeCredentials.Password))
        {
            return (runtimeCredentials.Username, runtimeCredentials.Password);
        }

        if (string.IsNullOrWhiteSpace(_options.Username) || string.IsNullOrWhiteSpace(_options.Password))
        {
            return null;
        }

        return (_options.Username, _options.Password);
    }

    private static List<string> ExtractStatuses(JsonElement root, int expectedCount)
    {
        if (root.ValueKind != JsonValueKind.Array)
        {
            return Enumerable.Repeat("Not found", expectedCount).ToList();
        }

        var statuses = new List<string>();

        foreach (var item in root.EnumerateArray())
        {
            statuses.Add(ResolveStatus(item));
        }

        return statuses;
    }

    private static string ResolveStatus(JsonElement item)
    {
        if (item.ValueKind == JsonValueKind.String)
        {
            return item.GetString() ?? "Not found";
        }

        if (item.ValueKind != JsonValueKind.Object)
        {
            return "Not found";
        }

        var statusPropertyNames = new[] { "status", "result", "message" };

        foreach (var propertyName in statusPropertyNames)
        {
            if (item.TryGetProperty(propertyName, out var statusElement) && statusElement.ValueKind == JsonValueKind.String)
            {
                return statusElement.GetString() ?? "Not found";
            }
        }

        return "Not found";
    }
}

public sealed class NamingServiceException : Exception
{
    public NamingServiceException(string message, HttpStatusCode statusCode)
        : base(message)
    {
        StatusCode = statusCode;
    }

    public NamingServiceException(string message, HttpStatusCode statusCode, Exception innerException)
        : base(message, innerException)
    {
        StatusCode = statusCode;
    }

    public HttpStatusCode StatusCode { get; }
}
