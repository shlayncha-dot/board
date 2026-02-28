using System.Text.Json;

namespace SLS_Planning_1C.Server.Features.RouteSheetSettings;

public interface IRouteSheetSettingsStore
{
    Task<RouteSheetSettingsDto> GetAsync(CancellationToken cancellationToken);
    Task<RouteSheetSettingsDto> SaveAsync(RouteSheetSettingsDto settings, CancellationToken cancellationToken);
}

public sealed class RouteSheetSettingsStore : IRouteSheetSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private readonly SemaphoreSlim _semaphore = new(1, 1);
    private readonly string _dbFilePath;

    public RouteSheetSettingsStore(IHostEnvironment environment)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);
        _dbFilePath = Path.Combine(dataDirectory, "technologist-route-sheet-settings.json");
        EnsureSeeded();
    }

    public async Task<RouteSheetSettingsDto> GetAsync(CancellationToken cancellationToken)
    {
        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var db = await ReadUnsafeAsync(cancellationToken);
            return Sanitize(db.Settings);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<RouteSheetSettingsDto> SaveAsync(RouteSheetSettingsDto settings, CancellationToken cancellationToken)
    {
        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var sanitized = Sanitize(settings);
            await WriteUnsafeAsync(new RouteSheetSettingsDatabase { Settings = sanitized }, cancellationToken);
            return sanitized;
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private void EnsureSeeded()
    {
        if (File.Exists(_dbFilePath))
        {
            return;
        }

        var database = new RouteSheetSettingsDatabase();
        File.WriteAllText(_dbFilePath, JsonSerializer.Serialize(database, JsonOptions));
    }

    private async Task<RouteSheetSettingsDatabase> ReadUnsafeAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_dbFilePath))
        {
            EnsureSeeded();
        }

        await using var stream = File.Open(_dbFilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var db = await JsonSerializer.DeserializeAsync<RouteSheetSettingsDatabase>(stream, cancellationToken: cancellationToken);
        return db ?? new RouteSheetSettingsDatabase();
    }

    private async Task WriteUnsafeAsync(RouteSheetSettingsDatabase database, CancellationToken cancellationToken)
    {
        await using var stream = File.Open(_dbFilePath, FileMode.Create, FileAccess.Write, FileShare.None);
        await JsonSerializer.SerializeAsync(stream, database, JsonOptions, cancellationToken);
    }

    private static RouteSheetSettingsDto Sanitize(RouteSheetSettingsDto settings)
    {
        var safeSectionsText = settings.SectionsText ?? string.Empty;
        var normalizedSections = safeSectionsText
            .Split(new[] { "\r\n", "\n" }, StringSplitOptions.None)
            .Select(value => value.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var sourceDetails = settings.SectionDetailsByName ?? new Dictionary<string, RouteSheetSectionDetailsDto>(StringComparer.OrdinalIgnoreCase);
        var details = new Dictionary<string, RouteSheetSectionDetailsDto>(StringComparer.OrdinalIgnoreCase);
        var fallbackEquipmentText = settings.EquipmentText?.Trim() ?? string.Empty;
        foreach (var section in normalizedSections)
        {
            sourceDetails.TryGetValue(section, out var sectionDetails);
            details[section] = new RouteSheetSectionDetailsDto
            {
                EquipmentText = sectionDetails?.EquipmentText?.Trim() ?? fallbackEquipmentText,
                ParametersText = sectionDetails?.ParametersText?.Trim() ?? string.Empty,
                QcText = sectionDetails?.QcText?.Trim() ?? string.Empty
            };
        }

        var selectedSection = settings.SelectedSection?.Trim() ?? string.Empty;
        if (!normalizedSections.Any(section => string.Equals(section, selectedSection, StringComparison.OrdinalIgnoreCase)))
        {
            selectedSection = normalizedSections.FirstOrDefault() ?? string.Empty;
        }

        var equipmentText = settings.EquipmentText?.Trim() ?? details.GetValueOrDefault(selectedSection)?.EquipmentText ?? string.Empty;

        return new RouteSheetSettingsDto
        {
            SectionsText = safeSectionsText,
            EquipmentText = equipmentText,
            SelectedSection = selectedSection,
            SectionDetailsByName = details
        };
    }
}
