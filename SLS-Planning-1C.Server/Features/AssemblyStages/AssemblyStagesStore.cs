using System.Text.Json;

namespace SLS_Planning_1C.Server.Features.AssemblyStages;

public interface IAssemblyStagesStore
{
    Task<IReadOnlyList<AssemblyProcedureDto>> GetBySpecificationVersionAsync(string specificationVersion, CancellationToken cancellationToken);
    Task<AssemblyProcedureDto> CreateProcedureAsync(CreateAssemblyProcedureRequest request, CancellationToken cancellationToken);
}

public sealed class AssemblyStagesStore : IAssemblyStagesStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private readonly SemaphoreSlim _semaphore = new(1, 1);
    private readonly string _dbFilePath;

    public AssemblyStagesStore(IHostEnvironment environment)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);
        _dbFilePath = Path.Combine(dataDirectory, "assembly-stages-procedures.json");
        EnsureSeeded();
    }

    public async Task<IReadOnlyList<AssemblyProcedureDto>> GetBySpecificationVersionAsync(string specificationVersion, CancellationToken cancellationToken)
    {
        var versionKey = (specificationVersion ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(versionKey))
        {
            return [];
        }

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var database = await ReadUnsafeAsync(cancellationToken);
            if (!database.ProceduresBySpecificationVersion.TryGetValue(versionKey, out var procedures))
            {
                return [];
            }

            return procedures.Select(SanitizeProcedure).ToList();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<AssemblyProcedureDto> CreateProcedureAsync(CreateAssemblyProcedureRequest request, CancellationToken cancellationToken)
    {
        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var database = await ReadUnsafeAsync(cancellationToken);
            var normalizedVersion = (request.SpecificationVersion ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(normalizedVersion))
            {
                throw new InvalidOperationException("Не указана версия спецификации.");
            }

            if (!database.ProceduresBySpecificationVersion.TryGetValue(normalizedVersion, out var procedures))
            {
                procedures = [];
                database.ProceduresBySpecificationVersion[normalizedVersion] = procedures;
            }

            var procedure = new AssemblyProcedureDto
            {
                Id = $"procedure-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{procedures.Count + 1}",
                SpecificationName = request.SpecificationName,
                SpecificationVersion = normalizedVersion,
                ProcedureName = request.ProcedureName,
                Place = request.Place,
                Normative = request.Normative,
                CreatedAtUtc = DateTime.UtcNow,
                Details = request.Details ?? []
            };

            var sanitized = SanitizeProcedure(procedure);
            procedures.Add(sanitized);
            await WriteUnsafeAsync(database, cancellationToken);
            return sanitized;
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

        var database = new AssemblyStagesDatabase();
        File.WriteAllText(_dbFilePath, JsonSerializer.Serialize(database, JsonOptions));
    }

    private async Task<AssemblyStagesDatabase> ReadUnsafeAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_dbFilePath))
        {
            EnsureSeeded();
        }

        await using var stream = File.Open(_dbFilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var db = await JsonSerializer.DeserializeAsync<AssemblyStagesDatabase>(stream, cancellationToken: cancellationToken);
        return db ?? new AssemblyStagesDatabase();
    }

    private async Task WriteUnsafeAsync(AssemblyStagesDatabase database, CancellationToken cancellationToken)
    {
        await using var stream = File.Open(_dbFilePath, FileMode.Create, FileAccess.Write, FileShare.None);
        await JsonSerializer.SerializeAsync(stream, database, JsonOptions, cancellationToken);
    }

    private static AssemblyProcedureDto SanitizeProcedure(AssemblyProcedureDto procedure)
    {
        var details = procedure.Details?
            .Select(detail => new AssemblyProcedureDetailDto
            {
                Poz = detail.Poz?.Trim() ?? string.Empty,
                Designation = detail.Designation?.Trim() ?? string.Empty,
                Name = detail.Name?.Trim() ?? string.Empty,
                Quantity = detail.Quantity?.Trim() ?? string.Empty
            })
            .Where(detail => !string.IsNullOrWhiteSpace(detail.Poz)
                || !string.IsNullOrWhiteSpace(detail.Designation)
                || !string.IsNullOrWhiteSpace(detail.Name)
                || !string.IsNullOrWhiteSpace(detail.Quantity))
            .ToList() ?? [];

        return new AssemblyProcedureDto
        {
            Id = procedure.Id?.Trim() ?? string.Empty,
            SpecificationName = procedure.SpecificationName?.Trim() ?? string.Empty,
            SpecificationVersion = procedure.SpecificationVersion?.Trim() ?? string.Empty,
            ProcedureName = procedure.ProcedureName?.Trim() ?? string.Empty,
            Place = procedure.Place?.Trim() ?? string.Empty,
            Normative = procedure.Normative?.Trim() ?? string.Empty,
            CreatedAtUtc = procedure.CreatedAtUtc,
            Details = details
        };
    }
}
