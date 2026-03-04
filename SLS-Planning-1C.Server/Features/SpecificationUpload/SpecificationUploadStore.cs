using System.Text.Json;

namespace SLS_Planning_1C.Server.Features.SpecificationUpload;

public interface ISpecificationUploadStore
{
    Task<IReadOnlyList<string>> GetProductNamesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<SpecificationRecordDto>> GetSpecificationsAsync(string? productName, CancellationToken cancellationToken);
    Task<int> GetNextVersionAsync(string productName, SpecificationType specType, CancellationToken cancellationToken);
    Task<SpecificationUploadResultDto> UploadAsync(SpecificationUploadRequest request, CancellationToken cancellationToken);
}

public sealed class SpecificationUploadStore : ISpecificationUploadStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private readonly SemaphoreSlim _semaphore = new(1, 1);
    private readonly string _dbFilePath;
    private readonly string _filesDirectory;

    public SpecificationUploadStore(IHostEnvironment environment)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);

        var legacyDbFilePath = Path.Combine(dataDirectory, "specification-upload-db.json");
        _dbFilePath = Path.Combine(dataDirectory, "program-specification-db.json");

        if (!File.Exists(_dbFilePath) && File.Exists(legacyDbFilePath))
        {
            File.Copy(legacyDbFilePath, _dbFilePath);
        }
        _filesDirectory = Path.Combine(dataDirectory, "specification-files");
        Directory.CreateDirectory(_filesDirectory);

        EnsureSeeded();
    }

    public async Task<IReadOnlyList<string>> GetProductNamesAsync(CancellationToken cancellationToken)
    {
        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var db = await ReadUnsafeAsync(cancellationToken);
            return db.Specifications
                .Select(row => row.SpecificationName.Trim())
                .Where(row => !string.IsNullOrWhiteSpace(row))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(row => row, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<IReadOnlyList<SpecificationRecordDto>> GetSpecificationsAsync(string? productName, CancellationToken cancellationToken)
    {
        var normalizedProductName = productName?.Trim();

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var db = await ReadUnsafeAsync(cancellationToken);
            var query = db.Specifications.AsEnumerable();

            if (!string.IsNullOrWhiteSpace(normalizedProductName))
            {
                query = query.Where(row => string.Equals(row.SpecificationName, normalizedProductName, StringComparison.OrdinalIgnoreCase));
            }

            return query
                .OrderByDescending(row => row.UploadedAtUtc)
                .ToList();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<int> GetNextVersionAsync(string productName, SpecificationType specType, CancellationToken cancellationToken)
    {
        var normalizedProductName = productName.Trim();

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var db = await ReadUnsafeAsync(cancellationToken);
            var maxVersion = db.Specifications
                .Where(row => string.Equals(row.SpecificationName, normalizedProductName, StringComparison.OrdinalIgnoreCase) && row.SpecType == specType)
                .Select(row => ExtractVersion(row.SpecificationCode))
                .DefaultIfEmpty(0)
                .Max();

            return maxVersion + 1;
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<SpecificationUploadResultDto> UploadAsync(SpecificationUploadRequest request, CancellationToken cancellationToken)
    {
        var productName = request.ProductName.Trim();
        var specificationName = request.SpecificationName.Trim();
        var uploadedBy = request.UploadedBy.Trim();
        var comment = request.Comment.Trim();

        if (string.IsNullOrWhiteSpace(productName))
        {
            return new SpecificationUploadResultDto
            {
                Success = false,
                Message = "Укажите наименование изделия."
            };
        }

        if (string.IsNullOrWhiteSpace(specificationName))
        {
            return new SpecificationUploadResultDto
            {
                Success = false,
                Message = "Укажите наименование спецификации."
            };
        }

        if (request.File is null || request.File.Length == 0)
        {
            return new SpecificationUploadResultDto
            {
                Success = false,
                Message = "Выберите Excel-файл спецификации."
            };
        }

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var db = await ReadUnsafeAsync(cancellationToken);
            var nextVersion = db.Specifications
                .Where(row => string.Equals(row.SpecificationName, specificationName, StringComparison.OrdinalIgnoreCase) && row.SpecType == request.SpecType)
                .Select(row => ExtractVersion(row.SpecificationCode))
                .DefaultIfEmpty(0)
                .Max() + 1;

            var version = request.Version <= 0 ? nextVersion : request.Version;
            var specCode = BuildSpecificationCode(request.SpecType, specificationName, version);
            var extension = Path.GetExtension(request.File.FileName);
            var safeFileName = $"{specCode}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{extension}";
            var destinationPath = Path.Combine(_filesDirectory, safeFileName);

            await using (var stream = File.Open(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await using var fileStream = request.File.OpenReadStream();
                await fileStream.CopyToAsync(stream, cancellationToken);
            }

            var record = new SpecificationRecordDto
            {
                Id = Guid.NewGuid(),
                SpecificationName = specificationName,
                SpecType = request.SpecType,
                SpecificationCode = specCode,
                OriginalFileName = request.File.FileName,
                UploadedBy = uploadedBy,
                Comment = comment,
                StoragePath = destinationPath,
                UploadedAtUtc = DateTimeOffset.UtcNow,
                OneCSyncStatus = OneCSyncStatus.Pending,
                OneCSyncMessage = "Ожидает дублирования на сервер 1С."
            };

            db.Specifications.Add(record);
            await WriteUnsafeAsync(db, cancellationToken);

            return new SpecificationUploadResultDto
            {
                Success = true,
                Message = "Спецификация сохранена на сервере программы. Дублирование на сервер 1С будет добавлено следующим этапом.",
                CreatedSpecification = record
            };
        }
        catch (Exception ex)
        {
            return new SpecificationUploadResultDto
            {
                Success = false,
                Message = $"Ошибка загрузки спецификации: {ex.Message}"
            };
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public static string BuildSpecificationCode(SpecificationType specType, string productName, int version)
    {
        return $"{specType}_{productName.Trim()}.V{version}";
    }

    private static int ExtractVersion(string specificationCode)
    {
        if (string.IsNullOrWhiteSpace(specificationCode))
        {
            return 0;
        }

        var versionMarkIndex = specificationCode.LastIndexOf(".V", StringComparison.OrdinalIgnoreCase);
        if (versionMarkIndex < 0)
        {
            return 0;
        }

        var versionPart = specificationCode[(versionMarkIndex + 2)..];
        return int.TryParse(versionPart, out var version) ? version : 0;
    }

    private void EnsureSeeded()
    {
        if (File.Exists(_dbFilePath))
        {
            return;
        }

        var database = new SpecificationUploadDatabase();
        File.WriteAllText(_dbFilePath, JsonSerializer.Serialize(database, JsonOptions));
    }

    private async Task<SpecificationUploadDatabase> ReadUnsafeAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_dbFilePath))
        {
            EnsureSeeded();
        }

        await using var stream = File.Open(_dbFilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var db = await JsonSerializer.DeserializeAsync<SpecificationUploadDatabase>(stream, cancellationToken: cancellationToken);
        return db ?? new SpecificationUploadDatabase();
    }

    private async Task WriteUnsafeAsync(SpecificationUploadDatabase database, CancellationToken cancellationToken)
    {
        await using var stream = File.Open(_dbFilePath, FileMode.Create, FileAccess.Write, FileShare.None);
        await JsonSerializer.SerializeAsync(stream, database, JsonOptions, cancellationToken);
    }
}
