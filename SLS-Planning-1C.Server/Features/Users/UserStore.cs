using System.Security.Cryptography;
using System.Text.Json;

namespace SLS_Planning_1C.Server.Features.Users;

public interface IUserStore
{
    Task<UserResponse?> ValidateCredentialsAsync(string login, string password, CancellationToken cancellationToken);
    Task<UserResponse?> GetUserAsync(string login, CancellationToken cancellationToken);
    Task<IReadOnlyList<UserListItemResponse>> GetUsersAsync(string adminLogin, CancellationToken cancellationToken);
    Task<(bool success, string? error)> CreateUserAsync(CreateUserRequest request, CancellationToken cancellationToken);
    Task<(bool success, string? error)> UpdateAccessAsync(UpdateUserAccessRequest request, CancellationToken cancellationToken);
    Task<(bool success, string? error)> UpdateProfileAsync(UpdateProfileRequest request, CancellationToken cancellationToken);
    Task<(bool success, string? error)> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken);
}

public sealed class UserStore : IUserStore
{
    private const int SaltLength = 16;
    private const int HashLength = 32;
    private const int Iterations = 100_000;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private static readonly string[] AllowedRoles =
    [
        "Конструктор", "Технолог", "Производство", "Сборка", "PilotGroup", "Oper", "ОТК", "Мастер", "Склад"
    ];

    private readonly SemaphoreSlim _semaphore = new(1, 1);
    private readonly string _dbFilePath;

    public UserStore(IHostEnvironment environment)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);
        _dbFilePath = Path.Combine(dataDirectory, "users.json");
        EnsureSeeded();
    }

    public async Task<UserResponse?> ValidateCredentialsAsync(string login, string password, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(password))
        {
            return null;
        }

        var db = await LoadAsync(cancellationToken);
        var user = db.Users.FirstOrDefault(u => string.Equals(u.Login, login.Trim(), StringComparison.OrdinalIgnoreCase));

        if (user is null || !VerifyPassword(password, user.PasswordSalt, user.PasswordHash))
        {
            return null;
        }

        return ToResponse(user);
    }

    public async Task<UserResponse?> GetUserAsync(string login, CancellationToken cancellationToken)
    {
        var db = await LoadAsync(cancellationToken);
        var user = db.Users.FirstOrDefault(u => string.Equals(u.Login, login.Trim(), StringComparison.OrdinalIgnoreCase));
        return user is null ? null : ToResponse(user);
    }

    public async Task<IReadOnlyList<UserListItemResponse>> GetUsersAsync(string adminLogin, CancellationToken cancellationToken)
    {
        var db = await LoadAsync(cancellationToken);
        var admin = db.Users.FirstOrDefault(u => string.Equals(u.Login, adminLogin.Trim(), StringComparison.OrdinalIgnoreCase));

        if (admin is null || !admin.IsAdmin)
        {
            return [];
        }

        return db.Users
            .OrderBy(u => u.Login, StringComparer.OrdinalIgnoreCase)
            .Select(u => new UserListItemResponse
            {
                Login = u.Login,
                FirstName = u.FirstName,
                LastName = u.LastName,
                Role = u.Role,
                Status = "Активен",
                IsAdmin = u.IsAdmin,
                Phone = u.Phone,
                Email = u.Email,
                PhotoUrl = u.PhotoUrl
            })
            .ToList();
    }

    public async Task<(bool success, string? error)> CreateUserAsync(CreateUserRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Login) || string.IsNullOrWhiteSpace(request.Password))
        {
            return (false, "Логин и пароль обязательны.");
        }

        var db = await LoadAsync(cancellationToken);
        var admin = db.Users.FirstOrDefault(u => string.Equals(u.Login, request.AdminLogin.Trim(), StringComparison.OrdinalIgnoreCase));

        if (admin is null || !admin.IsAdmin)
        {
            return (false, "Только администратор может создавать пользователей.");
        }

        if (db.Users.Any(u => string.Equals(u.Login, request.Login.Trim(), StringComparison.OrdinalIgnoreCase)))
        {
            return (false, "Пользователь с таким логином уже существует.");
        }

        var (salt, hash) = CreatePasswordHash(request.Password.Trim());
        db.Users.Add(new UserRecord
        {
            Login = request.Login.Trim(),
            PasswordSalt = salt,
            PasswordHash = hash,
            Role = "Oper",
            FirstName = request.Login.Trim(),
            LastName = string.Empty,
            IsAdmin = false
        });

        await SaveAsync(db, cancellationToken);
        return (true, null);
    }

    public async Task<(bool success, string? error)> UpdateAccessAsync(UpdateUserAccessRequest request, CancellationToken cancellationToken)
    {
        var db = await LoadAsync(cancellationToken);
        var admin = db.Users.FirstOrDefault(u => string.Equals(u.Login, request.AdminLogin.Trim(), StringComparison.OrdinalIgnoreCase));

        if (admin is null || !admin.IsAdmin)
        {
            return (false, "Только администратор может менять роли.");
        }

        if (!AllowedRoles.Contains(request.Role))
        {
            return (false, "Некорректная роль.");
        }

        var user = db.Users.FirstOrDefault(u => string.Equals(u.Login, request.Login.Trim(), StringComparison.OrdinalIgnoreCase));
        if (user is null)
        {
            return (false, "Пользователь не найден.");
        }

        user.Role = request.Role;
        user.IsAdmin = request.IsAdmin;
        user.UpdatedAt = DateTimeOffset.UtcNow;

        await SaveAsync(db, cancellationToken);
        return (true, null);
    }

    public async Task<(bool success, string? error)> UpdateProfileAsync(UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var db = await LoadAsync(cancellationToken);
        var user = db.Users.FirstOrDefault(u => string.Equals(u.Login, request.Login.Trim(), StringComparison.OrdinalIgnoreCase));
        if (user is null)
        {
            return (false, "Пользователь не найден.");
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.Phone = request.Phone.Trim();
        user.Email = request.Email.Trim();
        user.PhotoUrl = request.PhotoUrl.Trim();
        user.UpdatedAt = DateTimeOffset.UtcNow;

        await SaveAsync(db, cancellationToken);
        return (true, null);
    }

    public async Task<(bool success, string? error)> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        if (request.NewPassword != request.ConfirmNewPassword)
        {
            return (false, "Новые пароли не совпадают.");
        }

        if (string.IsNullOrWhiteSpace(request.NewPassword))
        {
            return (false, "Новый пароль не может быть пустым.");
        }

        var db = await LoadAsync(cancellationToken);
        var user = db.Users.FirstOrDefault(u => string.Equals(u.Login, request.Login.Trim(), StringComparison.OrdinalIgnoreCase));
        if (user is null)
        {
            return (false, "Пользователь не найден.");
        }

        if (!VerifyPassword(request.OldPassword, user.PasswordSalt, user.PasswordHash))
        {
            return (false, "Старый пароль неверный.");
        }

        var (salt, hash) = CreatePasswordHash(request.NewPassword);
        user.PasswordSalt = salt;
        user.PasswordHash = hash;
        user.UpdatedAt = DateTimeOffset.UtcNow;

        await SaveAsync(db, cancellationToken);
        return (true, null);
    }

    private async Task<UsersDatabase> LoadAsync(CancellationToken cancellationToken)
    {
        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            return await ReadUnsafeAsync(cancellationToken);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private async Task SaveAsync(UsersDatabase usersDatabase, CancellationToken cancellationToken)
    {
        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            await WriteUnsafeAsync(usersDatabase, cancellationToken);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private void EnsureSeeded()
    {
        if (File.Exists(_dbFilePath))
        {
            return;
        }

        var (salt, hash) = CreatePasswordHash("Ukrplat0312");
        var usersDb = new UsersDatabase
        {
            Users =
            [
                new UserRecord
                {
                    Login = "Andrew Chevchen",
                    PasswordSalt = salt,
                    PasswordHash = hash,
                    Role = "Oper",
                    FirstName = "Andrew",
                    LastName = "Chevchen",
                    IsAdmin = true,
                    Email = string.Empty,
                    Phone = string.Empty,
                    PhotoUrl = string.Empty
                }
            ]
        };

        File.WriteAllText(_dbFilePath, JsonSerializer.Serialize(usersDb, JsonOptions));
    }

    private async Task<UsersDatabase> ReadUnsafeAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_dbFilePath))
        {
            EnsureSeeded();
        }

        await using var stream = File.Open(_dbFilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var db = await JsonSerializer.DeserializeAsync<UsersDatabase>(stream, cancellationToken: cancellationToken);
        return db ?? new UsersDatabase();
    }

    private async Task WriteUnsafeAsync(UsersDatabase database, CancellationToken cancellationToken)
    {
        await using var stream = File.Open(_dbFilePath, FileMode.Create, FileAccess.Write, FileShare.None);
        await JsonSerializer.SerializeAsync(stream, database, JsonOptions, cancellationToken);
    }

    private static (string salt, string hash) CreatePasswordHash(string password)
    {
        Span<byte> saltBytes = stackalloc byte[SaltLength];
        RandomNumberGenerator.Fill(saltBytes);

        using var deriveBytes = new Rfc2898DeriveBytes(password, saltBytes.ToArray(), Iterations, HashAlgorithmName.SHA256);
        var hashBytes = deriveBytes.GetBytes(HashLength);

        return (Convert.ToBase64String(saltBytes), Convert.ToBase64String(hashBytes));
    }

    private static bool VerifyPassword(string password, string salt, string hash)
    {
        if (string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(salt) || string.IsNullOrWhiteSpace(hash))
        {
            return false;
        }

        var saltBytes = Convert.FromBase64String(salt);
        var expectedHash = Convert.FromBase64String(hash);
        using var deriveBytes = new Rfc2898DeriveBytes(password, saltBytes, Iterations, HashAlgorithmName.SHA256);
        var actualHash = deriveBytes.GetBytes(HashLength);

        return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
    }

    private static UserResponse ToResponse(UserRecord user)
    {
        return new UserResponse
        {
            Login = user.Login,
            Role = user.Role,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Phone = user.Phone,
            Email = user.Email,
            PhotoUrl = user.PhotoUrl,
            IsAdmin = user.IsAdmin
        };
    }
}
