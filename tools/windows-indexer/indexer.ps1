param(
  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = "config.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
  Write-Host "[$timestamp] $Message"
}

function Get-BasicAuthHeader {
  param($AuthConfig)

  if ($null -eq $AuthConfig -or $AuthConfig.type -ne "basic") {
    return $null
  }

  $pair = "{0}:{1}" -f [string]$AuthConfig.username, [string]$AuthConfig.password
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($pair)
  $token = [System.Convert]::ToBase64String($bytes)
  return @{ Authorization = "Basic $token" }
}

function Get-IndexedFiles {
  param([string]$RootPath)

  $items = Get-ChildItem -Path $RootPath -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @('.pdf', '.dxf') }

  $indexed = New-Object System.Collections.Generic.List[object]
  foreach ($item in $items) {
    $relativePath = [System.IO.Path]::GetRelativePath($RootPath, $item.FullName)
    $indexed.Add([PSCustomObject]@{
      fileName = $item.Name
      relativePath = $relativePath.Replace('\\', '/')
      extension = $item.Extension.ToLowerInvariant()
      lastWriteTimeUtc = $item.LastWriteTimeUtc.ToString("o")
      sizeBytes = [int64]$item.Length
    })
  }

  return $indexed
}

function Get-SnapshotHash {
  param($Files)

  $lines = $Files |
    Sort-Object relativePath |
    ForEach-Object { "{0}|{1}|{2}" -f $_.relativePath, $_.lastWriteTimeUtc, $_.sizeBytes }

  $text = [string]::Join("`n", $lines)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $hashBytes = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
}

function Invoke-SyncChunk {
  param(
    [string]$Url,
    [hashtable]$Headers,
    [string]$BodyJson
  )

  if ($null -ne $Headers) {
    return Invoke-RestMethod -Method Post -Uri $Url -Headers $Headers -ContentType "application/json" -Body $BodyJson
  }

  return Invoke-RestMethod -Method Post -Uri $Url -ContentType "application/json" -Body $BodyJson
}

function Send-IndexedFiles {
  param(
    [string]$ServerUrl,
    [string]$SyncEndpoint,
    [string]$MachineId,
    [string]$RootPath,
    $Files,
    [hashtable]$Headers,
    [int]$InitialChunkSize
  )

  $snapshotHash = Get-SnapshotHash -Files $Files
  $syncUrl = "{0}{1}" -f $ServerUrl.TrimEnd('/'), $SyncEndpoint
  $chunkSize = [Math]::Max(1, $InitialChunkSize)

  while ($true) {
    $chunks = @()
    if ($Files.Count -eq 0) {
      $chunks = ,@()
    } else {
      for ($i = 0; $i -lt $Files.Count; $i += $chunkSize) {
        $endExclusive = [Math]::Min($i + $chunkSize, $Files.Count)
        $chunks += ,@($Files[$i..($endExclusive - 1)])
      }
    }

    $totalChunks = [Math]::Max(1, $chunks.Count)
    $retryWithSmallerChunks = $false

    for ($chunkIndex = 0; $chunkIndex -lt $totalChunks; $chunkIndex++) {
      $payload = [PSCustomObject]@{
        machineId = $MachineId
        rootPath = $RootPath
        snapshotHash = $snapshotHash
        chunkIndex = [int]$chunkIndex
        totalChunks = [int]$totalChunks
        files = $chunks[$chunkIndex]
      }

      $json = $payload | ConvertTo-Json -Depth 6 -Compress

      try {
        $response = Invoke-SyncChunk -Url $syncUrl -Headers $Headers -BodyJson $json
        if ($response.updated -eq $true) {
          Write-Log "Sync completed. Files: $($response.fileCount)"
        }
      }
      catch {
        $statusCode = $null
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
          $statusCode = [int]$_.Exception.Response.StatusCode
        }

        if ($statusCode -eq 413 -and $chunkSize -gt 1) {
          $chunkSize = [Math]::Max(1, [Math]::Floor($chunkSize / 2))
          Write-Log "Received 413. Restarting sync with smaller chunk size: $chunkSize"
          $retryWithSmallerChunks = $true
          break
        }

        throw
      }
    }

    if (-not $retryWithSmallerChunks) {
      return
    }
  }
}


if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$scriptDir = Split-Path -Parent $PSCommandPath
$scanRootPath = [System.IO.Path]::GetFullPath((Join-Path $scriptDir $config.scanRoot))
$headers = Get-BasicAuthHeader -AuthConfig $config.auth
$intervalSec = if ($config.scanIntervalSeconds) { [int]$config.scanIntervalSeconds } else { 30 }
$chunkSize = if ($config.maxFilesPerChunk) { [int]$config.maxFilesPerChunk } else { 1000 }

Write-Host "Indexer started. Scan root: $scanRootPath"

while ($true) {
  try {
    $files = Get-IndexedFiles -RootPath $scanRootPath
    Send-IndexedFiles `
      -ServerUrl ([string]$config.serverUrl) `
      -SyncEndpoint ([string]$config.syncEndpoint) `
      -MachineId ([string]$config.machineId) `
      -RootPath $scanRootPath `
      -Files $files `
      -Headers $headers `
      -InitialChunkSize $chunkSize
  }
  catch {
    Write-Log ("Error: {0}" -f $_.Exception.Message)
  }

  Start-Sleep -Seconds $intervalSec
}
