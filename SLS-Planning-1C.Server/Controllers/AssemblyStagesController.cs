using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.AssemblyStages;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/assembly-stages/procedures")]
public sealed class AssemblyStagesController : ControllerBase
{
    private readonly IAssemblyStagesStore _store;

    public AssemblyStagesController(IAssemblyStagesStore store)
    {
        _store = store;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AssemblyProcedureDto>>> GetBySpecificationName([FromQuery] string specificationName, CancellationToken cancellationToken)
    {
        var procedures = await _store.GetBySpecificationNameAsync(specificationName, cancellationToken);
        return Ok(procedures);
    }

    [HttpPost]
    public async Task<ActionResult<AssemblyProcedureDto>> CreateProcedure([FromBody] CreateAssemblyProcedureRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request?.SpecificationName)
            || string.IsNullOrWhiteSpace(request.ProcedureName)
            || string.IsNullOrWhiteSpace(request.Place)
            || string.IsNullOrWhiteSpace(request.Normative))
        {
            return BadRequest(new { message = "Для создания процедуры заполните название спецификации, название процедуры, место и норматив." });
        }

        try
        {
            var procedure = await _store.CreateProcedureAsync(request, cancellationToken);
            return Ok(procedure);
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }
}
