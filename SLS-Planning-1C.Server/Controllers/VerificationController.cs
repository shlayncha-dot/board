using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.Naming;
using SLS_Planning_1C.Server.Features.Verification;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/verification")]
public sealed class VerificationController : ControllerBase
{
    private readonly IVerificationService _verificationService;
    private readonly IVerificationSettingsStore _verificationSettingsStore;
    private readonly ISpecificationTestService _specificationTestService;

    public VerificationController(
        IVerificationService verificationService,
        IVerificationSettingsStore verificationSettingsStore,
        ISpecificationTestService specificationTestService)
    {
        _verificationService = verificationService;
        _verificationSettingsStore = verificationSettingsStore;
        _specificationTestService = specificationTestService;
    }

    [HttpGet("settings")]
    public ActionResult<VerificationSettingsDto> GetSettings()
    {
        return Ok(_verificationSettingsStore.Get());
    }

    [HttpPut("settings")]
    public ActionResult<VerificationSettingsDto> SaveSettings([FromBody] VerificationSettingsDto settings)
    {
        try
        {
            var saved = _verificationSettingsStore.Save(settings);
            return Ok(saved);
        }
        catch (ArgumentException ex)
        {
            return ValidationProblem(ex.Message);
        }
    }

    [HttpPost("kd")]
    public ActionResult<VerificationResponse> VerifyKD([FromBody] VerificationRequest request)
    {
        var response = _verificationService.Verify(request);
        return Ok(response);
    }

    [HttpPost("specification-test")]
    public async Task<ActionResult<SpecificationTestResponse>> RunSpecificationTest(CancellationToken cancellationToken)
    {
        try
        {
            var response = await _specificationTestService.SendTestAsync(cancellationToken);
            return Ok(response);
        }
        catch (SpecificationTestServiceException ex)
        {
            return StatusCode((int)ex.StatusCode, new
            {
                message = ex.Message
            });
        }
    }
}
