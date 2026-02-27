namespace SLS_Planning_1C.Server.Features.Verification;

public sealed class VerificationTypeRuleDto
{
    public int Type { get; init; }
    public string Condition { get; init; } = string.Empty;
}

public sealed class VerifyRowDto
{
    public required string RowId { get; init; }
    public required Dictionary<string, string> Values { get; init; }
}

public sealed class VerificationRequest
{
    public required IReadOnlyList<VerifyRowDto> Rows { get; init; }
    public required IReadOnlyList<VerificationTypeRuleDto> TypeRules { get; init; }
}

public enum VerificationSeverity
{
    Missing,
    Duplicate
}

public sealed class VerificationIssueDto
{
    public required string RowId { get; init; }
    public required string DetailName { get; init; }
    public required VerificationSeverity Severity { get; init; }
    public required IReadOnlyList<string> Paths { get; init; }
}

public sealed class VerificationBlockResultDto
{
    public required string BlockName { get; init; }
    public required bool IsSuccess { get; init; }
    public required string Message { get; init; }
    public required IReadOnlyList<VerificationIssueDto> Issues { get; init; }
}

public sealed class VerificationResponse
{
    public required VerificationBlockResultDto Dxf { get; init; }
    public required VerificationBlockResultDto Pdf { get; init; }
}
