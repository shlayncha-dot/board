param(
  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = "./config.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RelativePath([string]$BasePath, [string]$TargetPath) {
  $baseUri = [Uri]((Resolve-Path $BasePath).Path.TrimEnd('\\') + "\\")
  $targetUri = [Uri](Resolve-Path $TargetPath).Path
  $relative = $baseUri.MakeRelativeUri($targetUri).ToString()
  return [Uri]::UnescapeDataString($relative).Replace('/', '\\')
}

function Get-SnapshotHash([array]$Files) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $lines = $Files |
      Sort-Object RelativePath |
      ForEach-Object { "{0}|{1}|{2}|{3:o}" -f $_.RelativePath, $_.SizeBytes, $_.Extension, $_.LastWriteTimeUtc }

    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

function Split-FileBatches([array]$Files, [hashtable]$PayloadTemplate, [int]$MaxPayloadBytes) {
  if ($Files.Count -eq 0) {
    return @(@())
  }

  $batches = @()
  $current = @()

  foreach ($file in $Files) {
    $candidate = $current + $file
    $payload = $PayloadTemplate.Clone()
    $payload.Files = $candidate
    $size = [System.Text.Encoding]::UTF8.GetByteCount(($payload | ConvertTo-Json -Depth 6 -Compress))

    if ($size -gt $MaxPayloadBytes -and $current.Count -gt 0) {
      $batches += ,$current
      $current = @($file)
    }
    else {
      $current = $candidate
    }
  }

  if ($current.Count -gt 0) {
    $batches += ,$current
  }

  return $batches
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config not found: $ConfigPath"
}

$configRaw = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8
$config = $configRaw | ConvertFrom-Json

if (-not $config.serverUrl) { throw "Config 'serverUrl' is required." }
if (-not $config.syncEndpoint) { throw "Config 'syncEndpoint' is required." }
if (-not $config.scanRoot) { throw "Config 'scanRoot' is required." }
if (-not $config.machineId) { throw "Config 'machineId' is required." }

$scriptDir = Split-Path -Parent (Resolve-Path $PSCommandPath)
$scanRoot = if ([System.IO.Path]::IsPathRooted([string]$config.scanRoot)) { [string]$config.scanRoot } else { Join-Path $scriptDir ([string]$config.scanRoot) }
$scanRoot = (Resolve-Path $scanRoot).Path

$serverUrl = ([string]$config.serverUrl).TrimEnd('/')
$syncEndpoint = if ([string]$config.syncEndpoint -like '/*') { [string]$config.syncEndpoint } else { "/$($config.syncEndpoint)" }
$syncUrl = "$serverUrl$syncEndpoint"

$scanIntervalSeconds = if ($null -ne $config.scanIntervalSeconds) { [int]$config.scanIntervalSeconds } else { 30 }
$maxPayloadBytes = if ($null -ne $config.maxPayloadBytes) { [int]$config.maxPayloadBytes } else { 800000 }

Write-Host "Indexer started. Scan root: $scanRoot"
Write-Host "Sync URL: $syncUrl"
Write-Host "Max payload bytes: $maxPayloadBytes"

$lastHash = $null

while ($true) {
  try {
    $files = Get-ChildItem -LiteralPath $scanRoot -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -in @('.pdf', '.dxf') } |
      ForEach-Object {
        [pscustomobject]@{
          FileName = $_.Name
          RelativePath = (Get-RelativePath -BasePath $scanRoot -TargetPath $_.FullName)
          Extension = $_.Extension.ToLowerInvariant()
          LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString("o")
          SizeBytes = [int64]$_.Length
        }
      }

    $snapshotHash = Get-SnapshotHash -Files $files

    if ($snapshotHash -eq $lastHash) {
      Start-Sleep -Seconds $scanIntervalSeconds
      continue
    }

    $payloadTemplate = @{
      MachineId = [string]$config.machineId
      RootPath = $scanRoot
      SnapshotHash = $snapshotHash
      Files = @()
    }

    $batches = Split-FileBatches -Files $files -PayloadTemplate $payloadTemplate -MaxPayloadBytes $maxPayloadBytes
    $totalChunks = $batches.Count

    for ($i = 0; $i -lt $totalChunks; $i++) {
      $payload = $payloadTemplate.Clone()
      $payload.Files = $batches[$i]

      if ($totalChunks -gt 1) {
        $payload.ChunkIndex = $i + 1
        $payload.TotalChunks = $totalChunks
      }

      $json = $payload | ConvertTo-Json -Depth 6 -Compress
      Invoke-RestMethod -Uri $syncUrl -Method Post -ContentType 'application/json' -Body $json | Out-Null
      Write-Host "[$(Get-Date -Format o)] Synced chunk $($i + 1)/$totalChunks, files: $($batches[$i].Count)"
    }

    $lastHash = $snapshotHash
  }
  catch {
    $err = $_
    if ($err.Exception.Response -and $err.Exception.Response.StatusCode) {
      $statusCode = [int]$err.Exception.Response.StatusCode
      Write-Host "[$(Get-Date -Format o)] Error: Удаленный сервер возвратил ошибку: ($statusCode) $($err.Exception.Response.StatusDescription)."
    }
    else {
      Write-Host "[$(Get-Date -Format o)] Error: $($err.Exception.Message)"
    }
  }

  Start-Sleep -Seconds $scanIntervalSeconds
}
