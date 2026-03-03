namespace SLS_Planning_1C.Server.Features.Naming;

using System.Text.Json;
using Microsoft.Extensions.Logging;

public interface INamingCredentialsStore
{
    void Save(string username, string password);
    bool TryGet(out NamingRuntimeCredentials credentials);
}

public sealed class NamingRuntimeCredentialsStore : INamingCredentialsStore
{
    private readonly object _sync = new();
    private readonly string _storageFilePath;
    private readonly ILogger<NamingRuntimeCredentialsStore> _logger;
    private NamingRuntimeCredentials? _credentials;

    public NamingRuntimeCredentialsStore(IWebHostEnvironment environment, ILogger<NamingRuntimeCredentialsStore> logger)
    {
        _logger = logger;

        var appDataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(appDataDirectory);
        _storageFilePath = Path.Combine(appDataDirectory, "naming-credentials.json");

        _credentials = LoadFromDisk();
    }

    public void Save(string username, string password)
    {
        var nextCredentials = new NamingRuntimeCredentials
        {
            Username = username,
            Password = password
        };

        lock (_sync)
        {
            _credentials = nextCredentials;
        }

        PersistToDisk(nextCredentials);
    }

    public bool TryGet(out NamingRuntimeCredentials credentials)
    {
        lock (_sync)
        {
            if (_credentials is null)
            {
                credentials = new NamingRuntimeCredentials();
                return false;
            }

            credentials = _credentials;
            return true;
        }
    }

    private NamingRuntimeCredentials? LoadFromDisk()
    {
        try
        {
            if (!File.Exists(_storageFilePath))
            {
                return null;
            }

            var rawJson = File.ReadAllText(_storageFilePath);
            var persisted = JsonSerializer.Deserialize<NamingRuntimeCredentials>(rawJson);

            if (persisted is null
                || string.IsNullOrWhiteSpace(persisted.Username)
                || string.IsNullOrWhiteSpace(persisted.Password))
            {
                return null;
            }

            return persisted;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Не удалось загрузить сохранённые credentials для Нейминг.");
            return null;
        }
    }

    private void PersistToDisk(NamingRuntimeCredentials credentials)
    {
        try
        {
            var json = JsonSerializer.Serialize(credentials);
            File.WriteAllText(_storageFilePath, json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Не удалось сохранить credentials для Нейминг.");
        }
    }
}

public sealed class NamingRuntimeCredentials
{
    public string Username { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
}
