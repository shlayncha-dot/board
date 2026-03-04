using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.Verification;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/verification")]
public sealed class VerificationController : ControllerBase
{
    private readonly IVerificationService _verificationService;
    private readonly IVerificationSettingsStore _verificationSettingsStore;
    public VerificationController(
        IVerificationService verificationService,
        IVerificationSettingsStore verificationSettingsStore)
    {
        _verificationService = verificationService;
        _verificationSettingsStore = verificationSettingsStore;
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
}
