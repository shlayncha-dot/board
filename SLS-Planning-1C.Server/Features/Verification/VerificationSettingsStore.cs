using System.Text.Json;

namespace SLS_Planning_1C.Server.Features.Verification;

public interface IVerificationSettingsStore
{
    VerificationSettingsDto Get();
    VerificationSettingsDto Save(VerificationSettingsDto settings);
}

public sealed class VerificationSettingsStore : IVerificationSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly object _sync = new();
    private readonly string _storagePath;
    private VerificationSettingsDto _settings;

    public VerificationSettingsStore(IHostEnvironment env)
    {
        var dataDir = Path.Combine(env.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDir);
        _storagePath = Path.Combine(dataDir, "verification-settings.json");
        _settings = LoadFromDisk() ?? CreateDefaultSettings();
    }

    public VerificationSettingsDto Get()
    {
        lock (_sync)
        {
            return Clone(_settings);
        }
    }

    public VerificationSettingsDto Save(VerificationSettingsDto settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var normalized = NormalizeAndValidate(settings);

        lock (_sync)
        {
            _settings = normalized;
            PersistToDisk();
            return Clone(_settings);
        }
    }

    private VerificationSettingsDto? LoadFromDisk()
    {
        if (!File.Exists(_storagePath))
        {
            return null;
        }

        var json = File.ReadAllText(_storagePath);
        var loaded = JsonSerializer.Deserialize<VerificationSettingsDto>(json, JsonOptions);
        return loaded is null ? null : NormalizeAndValidate(loaded);
    }

    private void PersistToDisk()
    {
        var json = JsonSerializer.Serialize(_settings, JsonOptions);
        File.WriteAllText(_storagePath, json);
    }

    private static VerificationSettingsDto NormalizeAndValidate(VerificationSettingsDto settings)
    {
        var rules = (settings.TypeRules ?? [])
            .Select(rule => new VerificationTypeRuleDto
            {
                Type = rule.Type,
                Description = rule.Description?.Trim() ?? string.Empty,
                Condition = rule.Condition?.Trim() ?? string.Empty
            })
            .OrderBy(rule => rule.Type)
            .ToList();

        if (rules.Count != 5)
        {
            throw new ArgumentException("Ожидается 5 параметров верификации (ТИП 1..5).", nameof(settings));
        }

        if (rules.Any(rule => rule.Type is < 1 or > 5))
        {
            throw new ArgumentException("Допустимые значения type: 1..5.", nameof(settings));
        }

        var hasDuplicates = rules
            .GroupBy(rule => rule.Type)
            .Any(group => group.Count() > 1);

        if (hasDuplicates)
        {
            throw new ArgumentException("Каждый type должен быть уникальным.", nameof(settings));
        }

        return new VerificationSettingsDto
        {
            TypeRules = rules
        };
    }

    private static VerificationSettingsDto CreateDefaultSettings()
    {
        return new VerificationSettingsDto
        {
            TypeRules = Enumerable.Range(1, 5)
                .Select(type => new VerificationTypeRuleDto
                {
                    Type = type,
                    Description = string.Empty,
                    Condition = string.Empty
                })
                .ToList()
        };
    }

    private static VerificationSettingsDto Clone(VerificationSettingsDto source)
    {
        return new VerificationSettingsDto
        {
            TypeRules = source.TypeRules
                .Select(rule => new VerificationTypeRuleDto
                {
                    Type = rule.Type,
                    Description = rule.Description,
                    Condition = rule.Condition
                })
                .ToList()
        };
    }
}
