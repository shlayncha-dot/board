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
    public ActionResult<FileIndexSyncResponse> Sync([FromBody] FileIndexSyncRequest request)
    {
        var totalChunks = request.TotalChunks.GetValueOrDefault(1);
        var chunkIndex = request.ChunkIndex.GetValueOrDefault(0);
        if (totalChunks < 1)
        {
            return BadRequest("TotalChunks должен быть >= 1.");
        }

        if (chunkIndex < 0 || chunkIndex >= totalChunks)
        {
            return BadRequest("ChunkIndex должен быть в диапазоне [0..TotalChunks-1].");
        }

        if (request.Files.Any(f => !IsSupportedExtension(f.Extension)))
        {
            return BadRequest("Разрешены только .pdf и .dxf файлы.");
        }

        var result = _fileIndexStore.UpsertSnapshot(request);
        return Ok(result);
    }

    private static bool IsSupportedExtension(string extension)
    {
        return string.Equals(extension, ".pdf", StringComparison.OrdinalIgnoreCase)
            || string.Equals(extension, ".dxf", StringComparison.OrdinalIgnoreCase);
    }
}
