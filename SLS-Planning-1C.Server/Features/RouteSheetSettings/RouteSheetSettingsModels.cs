namespace SLS_Planning_1C.Server.Features.RouteSheetSettings;

public sealed class RouteSheetSettingsDto
{
    public string SectionsText { get; set; } = string.Empty;
    public string EquipmentText { get; set; } = string.Empty;
    public string SelectedSection { get; set; } = string.Empty;
    public Dictionary<string, RouteSheetSectionDetailsDto> SectionDetailsByName { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class RouteSheetSectionDetailsDto
{
    public string ParametersText { get; set; } = string.Empty;
    public string QcText { get; set; } = string.Empty;
}

internal sealed class RouteSheetSettingsDatabase
{
    public RouteSheetSettingsDto Settings { get; set; } = new();
}
