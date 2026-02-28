using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using SLS_Planning_1C.Server.Features.Users;

namespace SLS_Planning_1C.Server.Controllers;

[ApiController]
[Route("api/users")]
public sealed class UserAccountsController : ControllerBase
{
    private readonly IUserStore _userStore;

    public UserAccountsController(IUserStore userStore)
    {
        _userStore = userStore;
    }

    [HttpPost("login")]
    public async Task<ActionResult<UserResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await _userStore.ValidateCredentialsAsync(request.Login, request.Password, cancellationToken);
        if (user is null)
        {
            return Unauthorized(new { message = "Неверный логин или пароль." });
        }

        return Ok(user);
    }

    [HttpGet("{login}")]
    public async Task<ActionResult<UserResponse>> GetByLogin(string login, CancellationToken cancellationToken)
    {
        var user = await _userStore.GetUserAsync(login, cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var result = await _userStore.UpdateProfileAsync(request, cancellationToken);
        return result.success ? Ok() : BadRequest(new { message = result.error });
    }

    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var result = await _userStore.ChangePasswordAsync(request, cancellationToken);
        return result.success ? Ok() : BadRequest(new { message = result.error });
    }



    [HttpPost("photo")]
    [RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<UploadPhotoResponse>> UploadPhoto([FromForm] string login, [FromForm] IFormFile photo, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(login))
        {
            return BadRequest(new { message = "Логин обязателен." });
        }

        if (photo is null || photo.Length == 0)
        {
            return BadRequest(new { message = "Файл не выбран." });
        }

        if (!photo.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Разрешены только изображения." });
        }

        var extension = Path.GetExtension(photo.FileName);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = ".png";
        }

        var safeLogin = Regex.Replace(login.Trim().ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
        if (string.IsNullOrWhiteSpace(safeLogin))
        {
            safeLogin = "user";
        }

        var uploadsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "avatars");
        Directory.CreateDirectory(uploadsDirectory);

        var fileName = $"{safeLogin}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{extension}";
        var filePath = Path.Combine(uploadsDirectory, fileName);

        await using (var stream = System.IO.File.Create(filePath))
        {
            await photo.CopyToAsync(stream, cancellationToken);
        }

        var photoUrl = $"/uploads/avatars/{fileName}";
        var result = await _userStore.UpdatePhotoAsync(login, photoUrl, cancellationToken);

        if (!result.success)
        {
            System.IO.File.Delete(filePath);
            return BadRequest(new { message = result.error });
        }

        return Ok(new UploadPhotoResponse { PhotoUrl = result.photoUrl ?? photoUrl });
    }
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UserListItemResponse>>> GetUsers([FromQuery] string adminLogin, CancellationToken cancellationToken)
    {
        var users = await _userStore.GetUsersAsync(adminLogin, cancellationToken);

        if (users.Count == 0)
        {
            return Forbid();
        }

        return Ok(users);
    }

    [HttpPost]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request, CancellationToken cancellationToken)
    {
        var result = await _userStore.CreateUserAsync(request, cancellationToken);
        return result.success ? Ok() : BadRequest(new { message = result.error });
    }

    [HttpPut("access")]
    public async Task<IActionResult> UpdateAccess([FromBody] UpdateUserAccessRequest request, CancellationToken cancellationToken)
    {
        var result = await _userStore.UpdateAccessAsync(request, cancellationToken);
        return result.success ? Ok() : BadRequest(new { message = result.error });
    }
}
