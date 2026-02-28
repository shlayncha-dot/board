namespace SLS_Planning_1C.Server.Features.AssemblyStages;

public sealed class AssemblyProcedureDetailDto
{
    public string Poz { get; set; } = string.Empty;
    public string Designation { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Quantity { get; set; } = string.Empty;
}

public sealed class AssemblyProcedureDto
{
    public string Id { get; set; } = string.Empty;
    public string SpecificationName { get; set; } = string.Empty;
    public string SpecificationVersion { get; set; } = string.Empty;
    public string ProcedureName { get; set; } = string.Empty;
    public string Place { get; set; } = string.Empty;
    public string Normative { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public List<AssemblyProcedureDetailDto> Details { get; set; } = [];
}

public sealed class CreateAssemblyProcedureRequest
{
    public string SpecificationName { get; set; } = string.Empty;
    public string SpecificationVersion { get; set; } = string.Empty;
    public string ProcedureName { get; set; } = string.Empty;
    public string Place { get; set; } = string.Empty;
    public string Normative { get; set; } = string.Empty;
    public List<AssemblyProcedureDetailDto> Details { get; set; } = [];
}

internal sealed class AssemblyStagesDatabase
{
    public Dictionary<string, List<AssemblyProcedureDto>> ProceduresBySpecificationVersion { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}
