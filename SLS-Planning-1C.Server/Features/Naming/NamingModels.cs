namespace SLS_Planning_1C.Server.Features.Naming;

public sealed class NamingCheckRequest
{
    public List<NamingCheckItemRequest> Items { get; init; } = [];
}

public sealed class NamingCheckItemRequest
{
    public string RowId { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
}

public sealed class NamingCheckResultItem
{
    public string RowId { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public bool IsFound { get; init; }
}

public sealed class NamingCheckResponse
{
    public List<NamingCheckResultItem> Results { get; init; } = [];
}

public sealed class NamingApiOptions
{
    public string CheckUrl { get; init; } = string.Empty;
    public string Username { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public bool IgnoreSslErrors { get; init; }
}


public sealed class NamingAuthCredentialsRequest
{
    public string Username { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
}

public sealed class NamingAuthStatusResponse
{
    public bool IsConfigured { get; init; }
}
