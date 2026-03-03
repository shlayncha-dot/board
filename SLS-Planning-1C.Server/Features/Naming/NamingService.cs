using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using CurlThin;
using CurlThin.Enums;
using CurlThin.SafeHandles;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SLS_Planning_1C.Server.Features.Naming;

public interface INamingService
{
    Task<NamingCheckResponse> CheckAsync(NamingCheckRequest request, CancellationToken cancellationToken);
}

public sealed class NamingService : INamingService
{
    private static readonly object CurlInitLock = new();
    private static bool _curlInitialized;

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

        EnsureCurlInitialized();
    }

    public Task<NamingCheckResponse> CheckAsync(NamingCheckRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (request.Items is null || request.Items.Count == 0)
        {
            return Task.FromResult(new NamingCheckResponse { Results = [] });
        }

        if (string.IsNullOrWhiteSpace(_options.CheckUrl))
        {
            throw new NamingServiceException("Не настроен URL API для проверки нейминга.", HttpStatusCode.ServiceUnavailable);
        }

        var payload = request.Items.Select(item => new { name = item.Name }).ToList();
        var payloadJson = JsonSerializer.Serialize(payload);

        var responseBody = ExecuteCurlRequest(payloadJson, cancellationToken, out var statusCode);

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

            return Task.FromResult(new NamingCheckResponse { Results = results });
        }
    }

    private string ExecuteCurlRequest(string payloadJson, CancellationToken cancellationToken, out HttpStatusCode statusCode)
    {
        using var easy = CurlNative.Easy.Init();
        if (easy.IsInvalid)
        {
            throw new NamingServiceException("Не удалось инициализировать Curl.", HttpStatusCode.BadGateway);
        }

        using var headers = BuildHeaders();
        var credentials = ResolveCredentials();
        var responseBuffer = new List<byte>();
        var callbackState = GCHandle.Alloc(responseBuffer);

        try
        {
            SetOptOrThrow(easy, CURLoption.URL, _options.CheckUrl);
            SetOptOrThrow(easy, CURLoption.POST, 1L);
            SetOptOrThrow(easy, CURLoption.POSTFIELDS, payloadJson);
            SetOptOrThrow(easy, CURLoption.POSTFIELDSIZE, Encoding.UTF8.GetByteCount(payloadJson));
            SetOptOrThrow(easy, CURLoption.HTTPHEADER, headers);
            SetOptOrThrow(easy, CURLoption.USERAGENT, "curl/7.81.0");
            SetOptOrThrow(easy, CURLoption.CONNECTTIMEOUT, 30L);
            SetOptOrThrow(easy, CURLoption.TIMEOUT, 30L);
            SetOptOrThrow(easy, CURLoption.SSL_VERIFYPEER, 0L);
            SetOptOrThrow(easy, CURLoption.SSL_VERIFYHOST, 0L);

            if (credentials is not null)
            {
                SetOptOrThrow(easy, CURLoption.HTTPAUTH, (long)CURLAUTH.CURLAUTH_BASIC);
                SetOptOrThrow(easy, CURLoption.USERPWD, $"{credentials.Value.Username}:{credentials.Value.Password}");
            }

            SetOptOrThrow(
                CurlNative.Easy.SetOpt(easy, CURLoption.WRITEFUNCTION, WriteResponseBodyCallback),
                CURLoption.WRITEFUNCTION);
            SetOptOrThrow(easy, CURLoption.WRITEDATA, GCHandle.ToIntPtr(callbackState));

            if (cancellationToken.CanBeCanceled)
            {
                SetOptOrThrow(easy, CURLoption.NOPROGRESS, 0L);
                SetOptOrThrow(
                    CurlNative.Easy.SetOpt(
                        easy,
                        CURLoption.XFERINFOFUNCTION,
                        (_, _, _, _, _) => cancellationToken.IsCancellationRequested ? 1 : 0),
                    CURLoption.XFERINFOFUNCTION);
            }

            var performResult = CurlNative.Easy.Perform(easy);
            if (performResult != CURLcode.CURLE_OK)
            {
                throw new NamingServiceException(
                    $"Ошибка вызова внешнего API через Curl: {performResult}.",
                    HttpStatusCode.BadGateway);
            }

            CurlNative.Easy.GetInfo(easy, CURLINFO.RESPONSE_CODE, out var httpStatusCodeLong);
            statusCode = (HttpStatusCode)httpStatusCodeLong;
            return Encoding.UTF8.GetString(responseBuffer.ToArray());
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Проверка нейминга была отменена через CancellationToken.");
            throw;
        }
        finally
        {
            callbackState.Free();
        }
    }

    private static void EnsureCurlInitialized()
    {
        lock (CurlInitLock)
        {
            if (_curlInitialized)
            {
                return;
            }

            try
            {
                CurlNative.Init();
                _curlInitialized = true;
            }
            catch (DllNotFoundException ex)
            {
                throw BuildNativeLibraryException(
                    "Не найдены нативные библиотеки Curl/OpenSSL.",
                    ex);
            }
            catch (BadImageFormatException ex)
            {
                throw BuildNativeLibraryException(
                    "Обнаружена несовместимая архитектура нативных библиотек Curl/OpenSSL (x86/x64).",
                    ex);
            }
        }
    }

    private static NamingServiceException BuildNativeLibraryException(string details, Exception innerException)
    {
        const string message =
            "Не удалось инициализировать CurlThin. " +
            "Проверьте, что рядом с приложением лежат runtime DLL: libcurl*.dll, libssl*.dll, libcrypto*.dll и зависимости. " +
            "Файлы *.a не подходят для запуска .NET-приложения. " +
            "Рекомендуемая папка проекта: SLS-Planning-1C.Server/native/win-x64/.";

        return new NamingServiceException($"{message} {details}", HttpStatusCode.BadGateway, innerException);
    }

    private static void SetOptOrThrow(SafeEasyHandle easy, CURLoption option, string value)
    {
        SetOptOrThrow(CurlNative.Easy.SetOpt(easy, option, value), option);
    }

    private static void SetOptOrThrow(SafeEasyHandle easy, CURLoption option, long value)
    {
        SetOptOrThrow(CurlNative.Easy.SetOpt(easy, option, value), option);
    }

    private static void SetOptOrThrow(SafeEasyHandle easy, CURLoption option, SafeSlistHandle value)
    {
        SetOptOrThrow(CurlNative.Easy.SetOpt(easy, option, value), option);
    }

    private static void SetOptOrThrow(CURLcode code, CURLoption option)
    {
        if (code != CURLcode.CURLE_OK)
        {
            throw new NamingServiceException($"Ошибка настройки Curl опции {option}: {code}.", HttpStatusCode.BadGateway);
        }
    }

    private static SafeSlistHandle BuildHeaders()
    {
        var headers = CurlNative.Slist.Append(SafeSlistHandle.Null, "Content-Type: application/json");
        headers = CurlNative.Slist.Append(headers, "User-Agent: curl/7.81.0");
        return headers;
    }

    private static nuint WriteResponseBodyCallback(IntPtr buffer, nuint size, nuint nItems, IntPtr userData)
    {
        var total = checked((int)(size * nItems));
        if (total <= 0)
        {
            return 0;
        }

        var state = GCHandle.FromIntPtr(userData);
        var target = (List<byte>)state.Target!;

        var chunk = new byte[total];
        Marshal.Copy(buffer, chunk, 0, total);
        target.AddRange(chunk);

        return (nuint)total;
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
