namespace SLS_Planning_1C.Server.Features.SpecificationUpload;

public enum SpecificationType
{
    Basic,
    Wire,
    Packaging,
    Tech
}

public enum OneCSyncStatus
{
    Pending,
    Synced,
    Failed
}

public sealed class SpecificationRecordDto
{
    public Guid Id { get; set; }
    public string SpecificationName { get; set; } = string.Empty;
    public SpecificationType SpecType { get; set; }
    public string SpecificationCode { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public string UploadedBy { get; set; } = string.Empty;
    public string Comment { get; set; } = string.Empty;
    public string StoragePath { get; set; } = string.Empty;
    public DateTimeOffset UploadedAtUtc { get; set; }
    public OneCSyncStatus OneCSyncStatus { get; set; } = OneCSyncStatus.Pending;
    public string OneCSyncMessage { get; set; } = string.Empty;
}

public sealed class SpecificationUploadRequest
{
    public string ProductName { get; set; } = string.Empty;
    public string SpecificationName { get; set; } = string.Empty;
    public SpecificationType SpecType { get; set; }
    public int Version { get; set; }
    public string UploadedBy { get; set; } = string.Empty;
    public string Comment { get; set; } = string.Empty;
    public IFormFile? File { get; set; }
}

public sealed class SpecificationUploadResultDto
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public SpecificationRecordDto? CreatedSpecification { get; set; }
}

public sealed class ProductNamesResponseDto
{
    public List<string> ProductNames { get; set; } = [];
}

public sealed class NextVersionResponseDto
{
    public int NextVersion { get; set; }
    public string SuggestedSpecificationCode { get; set; } = string.Empty;
}

internal sealed class SpecificationUploadDatabase
{
    public List<SpecificationRecordDto> Specifications { get; set; } = [];
}
