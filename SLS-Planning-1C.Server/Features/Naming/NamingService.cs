using System.Text;
using System.Text.Json;
using System.Net;
using System.Net.Http.Headers;
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

    public NamingService(HttpClient httpClient, IOptions<NamingApiOptions> options, INamingCredentialsStore credentialsStore)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _credentialsStore = credentialsStore;
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
        var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, _options.CheckUrl)
        {
            Content = content
        };

        AddBasicAuthorizationHeaderIfConfigured(httpRequest);

        HttpResponseMessage response;
        try
        {
            response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new NamingServiceException($"Не удалось подключиться к сервису Нейминг: {ex.Message}", HttpStatusCode.BadGateway);
        }

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

public sealed class NamingServiceException : Exception
{
    public NamingServiceException(string message, HttpStatusCode statusCode)
        : base(message)
    {
        StatusCode = statusCode;
    }

    public HttpStatusCode StatusCode { get; }
}
