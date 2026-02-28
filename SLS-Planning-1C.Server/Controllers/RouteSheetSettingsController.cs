using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.RouteSheetSettings;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/technologist/route-sheet-settings")]
public sealed class RouteSheetSettingsController : ControllerBase
{
    private readonly IRouteSheetSettingsStore _store;

    public RouteSheetSettingsController(IRouteSheetSettingsStore store)
    {
        _store = store;
    }

    [HttpGet]
    public async Task<ActionResult<RouteSheetSettingsDto>> Get(CancellationToken cancellationToken)
    {
        var settings = await _store.GetAsync(cancellationToken);
        return Ok(settings);
    }

    [HttpPut]
    public async Task<ActionResult<RouteSheetSettingsDto>> Save([FromBody] RouteSheetSettingsDto settings, CancellationToken cancellationToken)
    {
        var saved = await _store.SaveAsync(settings, cancellationToken);
        return Ok(saved);
    }
}
