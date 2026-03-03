using System.Text;
using System.Text.Json;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SLS_Planning_1C.Server.Features.Naming;

public interface INamingService
{
    Task<NamingCheckResponse> CheckAsync(NamingCheckRequest request, CancellationToken cancellationToken);
}

public sealed class NamingService : INamingService
{
    private readonly HttpClient _httpClient;
    private readonly NamingApiOptions _options;
    private readonly INamingCredentialsStore _credentialsStore;
    private readonly ILogger<NamingService> _logger;

    public NamingService(
        HttpClient httpClient,
        IOptions<NamingApiOptions> options,
        INamingCredentialsStore credentialsStore,
        ILogger<NamingService> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _credentialsStore = credentialsStore;
        _logger = logger;
    }

    public async Task<NamingCheckResponse> CheckAsync(NamingCheckRequest request, CancellationToken cancellationToken)
    {
        if (request.Items is null || request.Items.Count == 0)
        {
            return new NamingCheckResponse
            {
                Results = []
            };
        }

        if (string.IsNullOrWhiteSpace(_options.CheckUrl))
        {
            throw new NamingServiceException("Не настроен URL API для проверки нейминга.", HttpStatusCode.ServiceUnavailable);
        }

        var payload = request.Items.Select(item => new { name = item.Name }).ToList();
        var payloadJson = JsonSerializer.Serialize(payload);
        var response = await SendWithTlsFallbackAsync(payloadJson, cancellationToken);

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var isUnauthorized = response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden;
                var message = isUnauthorized
                    ? "Внешний сервис нейминга отклонил запрос (401/403). Проверьте логин и пароль 1С в настройках сервера."
                    : $"Сервис Нейминг вернул ошибку {(int)response.StatusCode}.";

                throw new NamingServiceException(message, HttpStatusCode.BadGateway);
            }

            JsonDocument document;
            try
            {
                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
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

                return new NamingCheckResponse
                {
                    Results = results
                };
            }
        }
    }

    private async Task<HttpResponseMessage> SendWithTlsFallbackAsync(string payloadJson, CancellationToken cancellationToken)
    {
        var allowInsecureFallback = _options.IgnoreSslErrors || IsLocalServerEnvironment();
        var attempts = new[]
        {
            new HttpTlsAttempt("SystemDefault", null),
            new HttpTlsAttempt("SystemDefault-HTTP1.1", null, HttpVersion: HttpVersion.Version11),
            new HttpTlsAttempt("TLS1.3", SslProtocols.Tls13),
            new HttpTlsAttempt("TLS1.2", SslProtocols.Tls12),
            new HttpTlsAttempt("TLS1.2-NoRevocation", SslProtocols.Tls12, CheckCertificateRevocationList: false),
            new HttpTlsAttempt("TLS1.2-Insecure", SslProtocols.Tls12, IgnoreSslErrors: allowInsecureFallback)
        };

        Exception? lastError = null;

        foreach (var attempt in attempts)
        {
            try
            {
                _logger.LogInformation(
                    "Проверка нейминга: старт попытки {AttemptName} (Protocol: {Protocol}, HttpVersion: {HttpVersion}).",
                    attempt.Name,
                    attempt.Protocol?.ToString() ?? "SystemDefault",
                    attempt.HttpVersion?.ToString() ?? "Default");

                using var request = BuildRequest(payloadJson, attempt.HttpVersion);

                if (attempt.Protocol is null)
                {
                    var response = await _httpClient.SendAsync(request, cancellationToken);
                    _logger.LogInformation("Проверка нейминга: попытка {AttemptName} завершилась HTTP {StatusCode}.", attempt.Name, (int)response.StatusCode);
                    return response;
                }

                using var handler = CreateHttpHandler(attempt.Protocol, attempt.IgnoreSslErrors, attempt.CheckCertificateRevocationList);
                using var client = new HttpClient(handler, disposeHandler: true);
                var tlsResponse = await client.SendAsync(request, cancellationToken);
                _logger.LogInformation("Проверка нейминга: попытка {AttemptName} завершилась HTTP {StatusCode}.", attempt.Name, (int)tlsResponse.StatusCode);
                return tlsResponse;
            }
            catch (HttpRequestException ex)
            {
                lastError = ex;
                _logger.LogWarning(ex, "Проверка нейминга: попытка {AttemptName} провалена (Protocol: {Protocol}, HttpVersion: {HttpVersion}).",
                    attempt.Name,
                    attempt.Protocol?.ToString() ?? "SystemDefault",
                    attempt.HttpVersion?.ToString() ?? "Default");
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                lastError = new TimeoutException($"Таймаут при попытке {attempt.Name}.");
                _logger.LogWarning("Проверка нейминга: попытка {AttemptName} завершилась таймаутом (Protocol: {Protocol}, HttpVersion: {HttpVersion}).",
                    attempt.Name,
                    attempt.Protocol?.ToString() ?? "SystemDefault",
                    attempt.HttpVersion?.ToString() ?? "Default");
            }
        }

        throw new NamingServiceException($"Не удалось подключиться к сервису Нейминг: {ExtractErrorMessage(lastError)}", HttpStatusCode.BadGateway);
    }

    private static string ExtractErrorMessage(Exception? error)
    {
        if (error is null)
        {
            return "неизвестная ошибка подключения.";
        }

        var messages = new List<string>();
        var current = error;

        while (current is not null)
        {
            if (!string.IsNullOrWhiteSpace(current.Message))
            {
                messages.Add(current.Message.Trim());
            }

            current = current.InnerException;
        }

        return messages.Count == 0
            ? "неизвестная ошибка подключения."
            : string.Join(" | ", messages.Distinct(StringComparer.Ordinal));
    }

    private HttpRequestMessage BuildRequest(string payloadJson, Version? httpVersion = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, _options.CheckUrl)
        {
            Content = new StringContent(payloadJson, Encoding.UTF8, "application/json")
        };

        if (httpVersion is not null)
        {
            request.Version = httpVersion;
            request.VersionPolicy = HttpVersionPolicy.RequestVersionOrLower;
        }

        AddBasicAuthorizationHeaderIfConfigured(request);
        return request;
    }

    private HttpClientHandler CreateHttpHandler(SslProtocols? protocol, bool ignoreSslErrors = false, bool checkCertificateRevocationList = true)
    {
        var handler = new HttpClientHandler();

        if (protocol.HasValue)
        {
            handler.SslProtocols = protocol.Value;
        }

        handler.CheckCertificateRevocationList = checkCertificateRevocationList;

        if (_options.IgnoreSslErrors || ignoreSslErrors)
        {
            handler.ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
        }

        return handler;
    }

    private static bool IsLocalServerEnvironment()
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        return string.Equals(environment, "Development", StringComparison.OrdinalIgnoreCase)
               || string.Equals(environment, "Local", StringComparison.OrdinalIgnoreCase);
    }

    private void AddBasicAuthorizationHeaderIfConfigured(HttpRequestMessage request)
    {
        var credentials = ResolveCredentials();
        if (credentials is null)
        {
            return;
        }

        var rawCredentials = $"{credentials.Value.Username}:{credentials.Value.Password}";
        var encodedCredentials = Convert.ToBase64String(Encoding.UTF8.GetBytes(rawCredentials));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", encodedCredentials);
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

public sealed record HttpTlsAttempt(
    string Name,
    SslProtocols? Protocol,
    bool IgnoreSslErrors = false,
    bool CheckCertificateRevocationList = true,
    Version? HttpVersion = null);

public sealed class NamingServiceException : Exception
{
    public NamingServiceException(string message, HttpStatusCode statusCode)
        : base(message)
    {
        StatusCode = statusCode;
    }

    public HttpStatusCode StatusCode { get; }
}
