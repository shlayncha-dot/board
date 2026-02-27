using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.Verification;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/verification")]
public sealed class VerificationController : ControllerBase
{
    private readonly IVerificationService _verificationService;

    public VerificationController(IVerificationService verificationService)
    {
        _verificationService = verificationService;
    }

    [HttpPost("kd")]
    public ActionResult<VerificationResponse> VerifyKD([FromBody] VerificationRequest request)
    {
        var response = _verificationService.Verify(request);
        return Ok(response);
    }
}
