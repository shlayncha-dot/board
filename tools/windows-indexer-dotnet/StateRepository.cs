using Microsoft.Data.Sqlite;

namespace WindowsIndexer.Worker;

public sealed class StateRepository
{
    private readonly string _connectionString;

    public StateRepository(string dbPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        }.ToString();

        Initialize();
    }

    public string? GetLastSnapshotHash()
    {
        using var conn = Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT value FROM state WHERE key = 'last_snapshot_hash' LIMIT 1;";
        return cmd.ExecuteScalar() as string;
    }

    public Dictionary<string, IndexedFileDto> LoadFilesByPath()
    {
        using var conn = Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT file_name, relative_path, extension, last_write_utc, size_bytes FROM files;";

        using var reader = cmd.ExecuteReader();
        var result = new Dictionary<string, IndexedFileDto>(StringComparer.OrdinalIgnoreCase);

        while (reader.Read())
        {
            var file = new IndexedFileDto(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                DateTime.Parse(reader.GetString(3)).ToUniversalTime(),
                reader.GetInt64(4));
            result[file.RelativePath] = file;
        }

        return result;
    }

    public void SaveSnapshot(string snapshotHash, IReadOnlyList<IndexedFileDto> files)
    {
        using var conn = Open();
        using var tx = conn.BeginTransaction();

        using (var clear = conn.CreateCommand())
        {
            clear.Transaction = tx;
            clear.CommandText = "DELETE FROM files;";
            clear.ExecuteNonQuery();
        }

        using (var insert = conn.CreateCommand())
        {
            insert.Transaction = tx;
            insert.CommandText = @"
INSERT INTO files(relative_path, file_name, extension, last_write_utc, size_bytes, fingerprint)
VALUES($relative_path, $file_name, $extension, $last_write_utc, $size_bytes, $fingerprint);";

            var pRelativePath = insert.CreateParameter(); pRelativePath.ParameterName = "$relative_path";
            var pFileName = insert.CreateParameter(); pFileName.ParameterName = "$file_name";
            var pExtension = insert.CreateParameter(); pExtension.ParameterName = "$extension";
            var pLastWriteUtc = insert.CreateParameter(); pLastWriteUtc.ParameterName = "$last_write_utc";
            var pSizeBytes = insert.CreateParameter(); pSizeBytes.ParameterName = "$size_bytes";
            var pFingerprint = insert.CreateParameter(); pFingerprint.ParameterName = "$fingerprint";

            insert.Parameters.AddRange([pRelativePath, pFileName, pExtension, pLastWriteUtc, pSizeBytes, pFingerprint]);

            foreach (var file in files)
            {
                pRelativePath.Value = file.RelativePath;
                pFileName.Value = file.FileName;
                pExtension.Value = file.Extension;
                pLastWriteUtc.Value = file.LastWriteTimeUtc.ToString("O");
                pSizeBytes.Value = file.SizeBytes;
                pFingerprint.Value = file.Fingerprint;
                insert.ExecuteNonQuery();
            }
        }

        using (var upsert = conn.CreateCommand())
        {
            upsert.Transaction = tx;
            upsert.CommandText = @"
INSERT INTO state(key, value) VALUES('last_snapshot_hash', $value)
ON CONFLICT(key) DO UPDATE SET value = excluded.value;";
            upsert.Parameters.AddWithValue("$value", snapshotHash);
            upsert.ExecuteNonQuery();
        }

        tx.Commit();
    }

    private SqliteConnection Open()
    {
        var conn = new SqliteConnection(_connectionString);
        conn.Open();
        return conn;
    }

    private void Initialize()
    {
        using var conn = Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
CREATE TABLE IF NOT EXISTS state(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files(
  relative_path TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  last_write_utc TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  fingerprint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_fingerprint ON files(fingerprint);";
        cmd.ExecuteNonQuery();
    }
}
