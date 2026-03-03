using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace SLS_Planning_1C.Server.Features.Naming;

public interface ISpecificationTestService
{
    Task<SpecificationTestResponse> SendTestAsync(CancellationToken cancellationToken);
}

public sealed class SpecificationTestService : ISpecificationTestService
{
    private readonly HttpClient _httpClient;
    private readonly NamingApiOptions _options;
    private readonly INamingCredentialsStore _credentialsStore;

    public SpecificationTestService(
        HttpClient httpClient,
        IOptions<NamingApiOptions> options,
        INamingCredentialsStore credentialsStore)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _credentialsStore = credentialsStore;
    }

    public async Task<SpecificationTestResponse> SendTestAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.SpecificationTestUrl))
        {
            throw new SpecificationTestServiceException("Не настроен URL для теста API спецификации.", HttpStatusCode.ServiceUnavailable);
        }

        var request = new HttpRequestMessage(HttpMethod.Post, _options.SpecificationTestUrl)
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };

        AddBasicAuthorizationHeader(request);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var message = string.IsNullOrWhiteSpace(responseBody)
                ? $"Тестовый запрос завершился с HTTP {(int)response.StatusCode}."
                : responseBody;

            throw new SpecificationTestServiceException(message, response.StatusCode);
        }

        var messageText = TryExtractMessage(responseBody);

        return new SpecificationTestResponse
        {
            Message = string.IsNullOrWhiteSpace(messageText)
                ? "Тестовый запрос выполнен успешно."
                : messageText,
            RawResponse = responseBody,
            StatusCode = (int)response.StatusCode
        };
    }

    private void AddBasicAuthorizationHeader(HttpRequestMessage request)
    {
        var credentials = ResolveCredentials();

        if (credentials is null)
        {
            throw new SpecificationTestServiceException("Не найдены логин/пароль 1С. Сначала сохраните их в программе.", HttpStatusCode.BadRequest);
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

    private static string TryExtractMessage(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return string.Empty;
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            var root = document.RootElement;

            if (root.ValueKind == JsonValueKind.String)
            {
                return root.GetString() ?? string.Empty;
            }

            if (root.ValueKind == JsonValueKind.Object)
            {
                foreach (var propertyName in new[] { "message", "detail", "result", "status" })
                {
                    if (root.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String)
                    {
                        return value.GetString() ?? string.Empty;
                    }
                }
            }
        }
        catch (JsonException)
        {
            // Ignore parse error and return the raw response below.
        }

        return responseBody;
    }
}

public sealed class SpecificationTestResponse
{
    public string Message { get; init; } = string.Empty;
    public string RawResponse { get; init; } = string.Empty;
    public int StatusCode { get; init; }
}

public sealed class SpecificationTestServiceException : Exception
{
    public SpecificationTestServiceException(string message, HttpStatusCode statusCode)
        : base(message)
    {
        StatusCode = statusCode;
    }

    public HttpStatusCode StatusCode { get; }
}
