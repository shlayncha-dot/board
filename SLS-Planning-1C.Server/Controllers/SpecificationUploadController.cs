using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.SpecificationUpload;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/specification-upload")]
public sealed class SpecificationUploadController : ControllerBase
{
    private readonly ISpecificationUploadStore _store;

    public SpecificationUploadController(ISpecificationUploadStore store)
    {
        _store = store;
    }

    [HttpGet("products")]
    public async Task<ActionResult<ProductNamesResponseDto>> GetProductNames(CancellationToken cancellationToken)
    {
        var productNames = await _store.GetProductNamesAsync(cancellationToken);
        return Ok(new ProductNamesResponseDto
        {
            ProductNames = productNames.ToList()
        });
    }

    [HttpGet("specifications")]
    public async Task<ActionResult<IReadOnlyList<SpecificationRecordDto>>> GetSpecifications([FromQuery] string productName, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(productName))
        {
            return Ok(Array.Empty<SpecificationRecordDto>());
        }

        var specifications = await _store.GetSpecificationsByProductAsync(productName, cancellationToken);
        return Ok(specifications);
    }

    [HttpGet("next-version")]
    public async Task<ActionResult<NextVersionResponseDto>> GetNextVersion([FromQuery] string productName, [FromQuery] SpecificationType specType, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(productName))
        {
            return Ok(new NextVersionResponseDto
            {
                NextVersion = 1,
                SuggestedSpecificationCode = string.Empty
            });
        }

        var nextVersion = await _store.GetNextVersionAsync(productName, specType, cancellationToken);
        return Ok(new NextVersionResponseDto
        {
            NextVersion = nextVersion,
            SuggestedSpecificationCode = SpecificationUploadStore.BuildSpecificationCode(specType, productName, nextVersion)
        });
    }

    [HttpPost("upload")]
    [RequestSizeLimit(100_000_000)]
    public async Task<ActionResult<SpecificationUploadResultDto>> Upload([FromForm] SpecificationUploadRequest request, CancellationToken cancellationToken)
    {
        var result = await _store.UploadAsync(request, cancellationToken);

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }
}
