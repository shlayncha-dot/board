using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.FileIndexing;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/file-index")]
public sealed class FileIndexController : ControllerBase
{
    private readonly IFileIndexStore _fileIndexStore;

    public FileIndexController(IFileIndexStore fileIndexStore)
    {
        _fileIndexStore = fileIndexStore;
    }

    [HttpPost("sync")]
    [HttpPost("sync-full")]
    public ActionResult<FileIndexSyncResponse> Sync([FromBody] FileIndexSyncRequest request)
    {
        try
        {
            var result = _fileIndexStore.UpsertSnapshot(request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }


    [HttpPost("sync-delta")]
    public ActionResult<FileIndexSyncResponse> SyncDelta([FromBody] FileIndexDeltaSyncRequest request)
    {
        try
        {
            var result = _fileIndexStore.ApplyDelta(request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("test")]
    public ActionResult<string> Test([FromBody] FileIndexTestRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FileName))
        {
            return BadRequest("FileName is required.");
        }

        return Ok("Дякую");
    }
}

public sealed class FileIndexTestRequest
{
    public required string FileName { get; init; }
}
