param(
  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = "./config.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([enum]::IsDefined([System.Net.SecurityProtocolType], 'Tls12')) {
  [System.Net.ServicePointManager]::SecurityProtocol =
    [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12
}

if ([enum]::IsDefined([System.Net.SecurityProtocolType], 'Tls13')) {
  [System.Net.ServicePointManager]::SecurityProtocol =
    [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls13
}

function Get-RelativePath([string]$BasePath, [string]$TargetPath) {
  $baseUri = [Uri]((Resolve-Path $BasePath).Path.TrimEnd('\\') + "\\")
  $targetUri = [Uri](Resolve-Path $TargetPath).Path
  $relative = $baseUri.MakeRelativeUri($targetUri).ToString()
  return [Uri]::UnescapeDataString($relative).Replace('/', '\\')
}

function Get-SnapshotHash([array]$Files) {
  if (-not $Files -or $Files.Count -eq 0) {
    return "empty"
  }

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $lines = $Files |
      Sort-Object RelativePath |
      ForEach-Object { "{0}|{1}|{2}|{3}" -f $_.RelativePath, $_.SizeBytes, $_.Extension, $_.LastWriteTimeUtc }

    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config not found: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $config.serverUrl) { throw "Config 'serverUrl' is required." }
if (-not $config.syncEndpoint) { throw "Config 'syncEndpoint' is required." }
if (-not $config.scanRoot) { throw "Config 'scanRoot' is required." }
if (-not $config.machineId) { throw "Config 'machineId' is required." }

$scriptDir = Split-Path -Parent (Resolve-Path $PSCommandPath)
$statePath = Join-Path $scriptDir ".indexer-state.json"

$scanRoot = if ([System.IO.Path]::IsPathRooted([string]$config.scanRoot)) { [string]$config.scanRoot } else { Join-Path $scriptDir ([string]$config.scanRoot) }
$scanRoot = (Resolve-Path $scanRoot).Path

$serverUrl = ([string]$config.serverUrl).TrimEnd('/')
$syncEndpoint = if ([string]$config.syncEndpoint -like '/*') { [string]$config.syncEndpoint } else { "/$($config.syncEndpoint)" }
$syncUrl = "$serverUrl$syncEndpoint"

$scanIntervalSeconds = if ($null -ne $config.scanIntervalSeconds) { [int]$config.scanIntervalSeconds } else { 30 }
$requestTimeoutSeconds = if ($null -ne $config.requestTimeoutSeconds) { [int]$config.requestTimeoutSeconds } else { 30 }
$maxChunkSize = if ($null -ne $config.maxChunkSize) { [int]$config.maxChunkSize } else { 250 }

if ($maxChunkSize -lt 1) {
  throw "Config 'maxChunkSize' must be >= 1."
}

$allowedExtensions = @{}
if ($config.PSObject.Properties.Name -contains 'includeExtensions' -and $config.includeExtensions) {
  foreach ($ext in @($config.includeExtensions)) {
    if ($null -eq $ext) { continue }
    $normalized = ([string]$ext).Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($normalized)) { continue }
    if (-not $normalized.StartsWith('.')) {
      $normalized = "." + $normalized
    }
    $allowedExtensions[$normalized] = $true
  }
}

$headers = @{}
if ($config.PSObject.Properties.Name -contains 'auth' -and $config.auth) {
  if ($config.auth.apiKey -and $config.auth.apiKeyHeader) {
    $headers[[string]$config.auth.apiKeyHeader] = [string]$config.auth.apiKey
  }
}

Write-Host "--- Indexer (compat) started ---"
Write-Host "Scan root: $scanRoot"
Write-Host "Sync URL: $syncUrl"
Write-Host "Max chunk size: $maxChunkSize"

$lastHash = ""
if (Test-Path -LiteralPath $statePath) {
  try {
    $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state -and $state.SnapshotHash) {
      $lastHash = [string]$state.SnapshotHash
    }
  }
  catch {
    Write-Host "Warning: failed to read state file, full sync will be sent." -ForegroundColor Yellow
  }
}

while ($true) {
  try {
    $allFiles = [System.IO.Directory]::GetFiles($scanRoot, "*.*", [System.IO.SearchOption]::AllDirectories)
    $wireFiles = [System.Collections.Generic.List[object]]::new()

    foreach ($filePath in $allFiles) {
      if ($filePath -eq $statePath) { continue }

      $fInfo = [System.IO.FileInfo]::new($filePath)
      $ext = ([string]$fInfo.Extension).ToLowerInvariant()

      if ($allowedExtensions.Count -gt 0 -and -not $allowedExtensions.ContainsKey($ext)) {
        continue
      }

      $wireFiles.Add([ordered]@{
        FileName         = [string]$fInfo.Name
        RelativePath     = [string](Get-RelativePath -BasePath $scanRoot -TargetPath $fInfo.FullName)
        Extension        = $ext
        LastWriteTimeUtc = $fInfo.LastWriteTimeUtc.ToString("o")
        SizeBytes        = [long]$fInfo.Length
      })
    }

    $currentFilesArray = @($wireFiles.ToArray())
    $totalFiles = $currentFilesArray.Count
    $currentHash = Get-SnapshotHash -Files $currentFilesArray

    if ($currentHash -eq $lastHash) {
      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] No changes ($totalFiles files)."
      Start-Sleep -Seconds $scanIntervalSeconds
      continue
    }

    $totalChunks = [Math]::Max(1, [Math]::Ceiling($totalFiles / [double]$maxChunkSize))
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Changes detected. Sending $totalFiles files in $totalChunks chunk(s)..."

    for ($i = 0; $i -lt $totalFiles; $i += $maxChunkSize) {
      $upperIndex = [Math]::Min($i + $maxChunkSize - 1, $totalFiles - 1)
      $chunkFiles = @($currentFilesArray[$i..$upperIndex])
      $chunkIndex = [Math]::Floor($i / $maxChunkSize) + 1

      $payload = [ordered]@{
        MachineId    = [string]$config.machineId
        RootPath     = $scanRoot
        SnapshotHash = $currentHash
        Files        = $chunkFiles
      }

      if ($totalChunks -gt 1) {
        $payload.ChunkIndex = $chunkIndex
        $payload.TotalChunks = $totalChunks
      }

      $json = $payload | ConvertTo-Json -Depth 6 -Compress
      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Sending chunk $chunkIndex/$totalChunks ($($chunkFiles.Count) files)..."

      Invoke-RestMethod -Uri $syncUrl -Method Post -Body $json -Headers $headers -ContentType "application/json" -TimeoutSec $requestTimeoutSeconds | Out-Null
    }

    $lastHash = $currentHash
    @{ SnapshotHash = $currentHash } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Sync completed successfully." -ForegroundColor Green
  }
  catch {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Error: $($_.Exception.Message)" -ForegroundColor Red
  }

  [System.GC]::Collect()
  Start-Sleep -Seconds $scanIntervalSeconds
}
