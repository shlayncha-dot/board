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

function Read-IndexerState([string]$StatePath) {
  if (-not (Test-Path -LiteralPath $StatePath)) {
    return $null
  }

  try {
    $raw = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
      return $null
    }

    $state = $raw | ConvertFrom-Json
    if ($state -and $state.PSObject.Properties.Name -contains 'LastSnapshotHash') {
      return [string]$state.LastSnapshotHash
    }

    return $null
  }
  catch {
    Write-Host "[$(Get-Date -Format o)] Warning: failed to read state file '$StatePath'."
    return $null
  }
}

function Write-IndexerState([string]$StatePath, [string]$SnapshotHash) {
  $state = @{
    LastSnapshotHash = $SnapshotHash
    UpdatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }

  $json = $state | ConvertTo-Json -Depth 3
  Set-Content -LiteralPath $StatePath -Value $json -Encoding UTF8
}

function Convert-ToIndexEntry([System.IO.FileInfo]$File, [string]$ScanRoot) {
  if (-not $File) {
    return $null
  }

  $fileName = [string]$File.Name
  $relativePath = [string](Get-RelativePath -BasePath $ScanRoot -TargetPath $File.FullName)
  $extension = [string]$File.Extension

  if ([string]::IsNullOrWhiteSpace($fileName) -or [string]::IsNullOrWhiteSpace($relativePath)) {
    return $null
  }

  [pscustomobject]@{
    FileName = $fileName
    RelativePath = $relativePath
    Extension = $extension.ToLowerInvariant()
    LastWriteTimeUtc = $File.LastWriteTimeUtc.ToString("o")
    SizeBytes = [int64]$File.Length
  }
}

function Convert-ToSafeString([object]$Value) {
  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [string]) {
    return $Value
  }

  if (
    $Value -is [char] -or
    $Value -is [bool] -or
    $Value -is [byte] -or
    $Value -is [sbyte] -or
    $Value -is [int16] -or
    $Value -is [uint16] -or
    $Value -is [int32] -or
    $Value -is [uint32] -or
    $Value -is [int64] -or
    $Value -is [uint64] -or
    $Value -is [single] -or
    $Value -is [double] -or
    $Value -is [decimal] -or
    $Value -is [datetime]
  ) {
    return [string]$Value
  }

  return $null
}

function Convert-ToWireFileEntry([object]$Entry) {
  if (-not $Entry) {
    return $null
  }

  $fileName = Convert-ToSafeString $Entry.FileName
  $relativePath = Convert-ToSafeString $Entry.RelativePath
  $extension = Convert-ToSafeString $Entry.Extension
  $lastWriteTimeUtc = Convert-ToSafeString $Entry.LastWriteTimeUtc

  if ([string]::IsNullOrWhiteSpace($fileName) -or [string]::IsNullOrWhiteSpace($relativePath)) {
    return $null
  }

  $sizeBytes = 0L
  try {
    $sizeBytes = [int64]$Entry.SizeBytes
  }
  catch {
    return $null
  }

  [ordered]@{
    FileName = $fileName
    RelativePath = $relativePath
    Extension = if ($extension) { $extension.ToLowerInvariant() } else { '' }
    LastWriteTimeUtc = if ($lastWriteTimeUtc) { $lastWriteTimeUtc } else { (Get-Date).ToUniversalTime().ToString('o') }
    SizeBytes = $sizeBytes
  }
}

function Split-FileBatches([array]$Files, [hashtable]$PayloadTemplate, [int]$MaxPayloadBytes) {
  if ($Files.Count -eq 0) {
    return @(@())
  }

  $batches = @()
  $current = @()

  foreach ($file in $Files) {
    $candidate = @($current + $file)
    $payload = $PayloadTemplate.Clone()
    $payload.Files = @($candidate)
    $size = [System.Text.Encoding]::UTF8.GetByteCount(($payload | ConvertTo-Json -Depth 6 -Compress))

    if ($size -gt $MaxPayloadBytes -and $current.Count -gt 0) {
      $batches += ,@($current)
      $current = @($file)
    }
    else {
      $current = $candidate
    }
  }

  if ($current.Count -gt 0) {
    $batches += ,@($current)
  }

  return $batches
}

function Get-ExceptionResponse([System.Exception]$Exception) {
  $current = $Exception

  while ($current) {
    if ($current.PSObject -and $current.PSObject.Properties.Name -contains 'Response') {
      $response = $current.PSObject.Properties['Response'].Value
      if ($response) {
        return $response
      }
    }

    $current = $current.InnerException
  }

  return $null
}

function Get-HttpErrorDetails([System.Management.Automation.ErrorRecord]$ErrorRecord) {
  if (-not $ErrorRecord -or -not $ErrorRecord.Exception) {
    return $null
  }

  $response = Get-ExceptionResponse -Exception $ErrorRecord.Exception
  if (-not $response) {
    return $null
  }

  try {
    $stream = $response.GetResponseStream()
    if (-not $stream) {
      return $null
    }

    $reader = [System.IO.StreamReader]::new($stream)
    try {
      $body = $reader.ReadToEnd()
      if ([string]::IsNullOrWhiteSpace($body)) {
        return $null
      }

      return $body
    }
    finally {
      $reader.Dispose()
      $stream.Dispose()
    }
  }
  catch {
    return $null
  }
}

function Test-IsTransientSendError([System.Management.Automation.ErrorRecord]$ErrorRecord) {
  if (-not $ErrorRecord -or -not $ErrorRecord.Exception) {
    return $false
  }

  $messages = @()
  $exception = $ErrorRecord.Exception

  while ($exception) {
    if ($exception.Message) {
      $messages += $exception.Message
    }

    if ($exception -is [System.Net.WebException] -and $exception.Status -eq [System.Net.WebExceptionStatus]::ConnectionClosed) {
      return $true
    }

    $exception = $exception.InnerException
  }

  $combined = ($messages -join ' | ').ToLowerInvariant()
  return $combined.Contains('underlying connection was closed') -or
    $combined.Contains('unexpected error on send')
}

function Invoke-SyncRequest(
  [string]$Uri,
  [hashtable]$Headers,
  [string]$Body,
  [int]$TimeoutSec,
  [int]$RetryCount,
  [int]$RetryDelaySeconds,
  [bool]$DisableKeepAlive
) {
  for ($attempt = 1; $attempt -le $RetryCount; $attempt++) {
    try {
      $requestParams = @{
        Uri = $Uri
        Method = 'Post'
        ContentType = 'application/json'
        Headers = $Headers
        Body = $Body
        TimeoutSec = $TimeoutSec
      }

      if ($DisableKeepAlive) {
        $requestParams.DisableKeepAlive = $true
      }

      Invoke-RestMethod @requestParams | Out-Null
      return
    }
    catch {
      $isLastAttempt = $attempt -eq $RetryCount
      $isTransient = Test-IsTransientSendError -ErrorRecord $_

      if ($isLastAttempt -or -not $isTransient) {
        throw
      }

      Write-Host "[$(Get-Date -Format o)] Warning: transient send error on attempt $attempt/$RetryCount. Retrying in $RetryDelaySeconds sec..."
      Start-Sleep -Seconds $RetryDelaySeconds
    }
  }
}

function Test-IsLoopbackUrl([string]$Url) {
  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $false
  }

  try {
    $uri = [Uri]$Url
    if (-not $uri.IsAbsoluteUri) {
      return $false
    }

    return $uri.IsLoopback
  }
  catch {
    return $false
  }
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
$statePath = Join-Path $scriptDir ".indexer-state.json"
$scanRoot = if ([System.IO.Path]::IsPathRooted([string]$config.scanRoot)) { [string]$config.scanRoot } else { Join-Path $scriptDir ([string]$config.scanRoot) }
$scanRoot = (Resolve-Path $scanRoot).Path

$excludedPaths = @{}
$excludedPaths[$statePath.ToLowerInvariant()] = $true

$serverUrl = ([string]$config.serverUrl).TrimEnd('/')
$syncEndpoint = if ([string]$config.syncEndpoint -like '/*') { [string]$config.syncEndpoint } else { "/$($config.syncEndpoint)" }
$syncUrl = "$serverUrl$syncEndpoint"

$scanIntervalSeconds = if ($null -ne $config.scanIntervalSeconds) { [int]$config.scanIntervalSeconds } else { 30 }
$maxPayloadBytes = if ($null -ne $config.maxPayloadBytes) { [int]$config.maxPayloadBytes } else { 800000 }
$requestTimeoutSeconds = if ($null -ne $config.requestTimeoutSeconds) { [int]$config.requestTimeoutSeconds } else { 30 }
$retryCount = if ($null -ne $config.retryCount) { [int]$config.retryCount } else { 3 }
$retryDelaySeconds = if ($null -ne $config.retryDelaySeconds) { [int]$config.retryDelaySeconds } else { 3 }
$disableKeepAlive = if ($null -ne $config.disableKeepAlive) { [bool]$config.disableKeepAlive } else { $true }

$headers = @{}
$authConfig = if ($config.PSObject.Properties.Name -contains 'auth') { $config.auth } else { $null }

$apiKeyHeader = if ($authConfig -and $authConfig.PSObject.Properties.Name -contains 'apiKeyHeader') { [string]$authConfig.apiKeyHeader } else { $null }
$apiKey = if ($authConfig -and $authConfig.PSObject.Properties.Name -contains 'apiKey') { [string]$authConfig.apiKey } else { $null }

if ($apiKeyHeader -and $apiKey) {
  $headers[$apiKeyHeader] = $apiKey
}

$username = if ($authConfig -and $authConfig.PSObject.Properties.Name -contains 'username') { [string]$authConfig.username } else { $null }
$password = if ($authConfig -and $authConfig.PSObject.Properties.Name -contains 'password') { [string]$authConfig.password } else { $null }

if ($username -and $password) {
  $basicAuth = "{0}:{1}" -f $username, $password
  $basicAuthBytes = [System.Text.Encoding]::UTF8.GetBytes($basicAuth)
  $headers["Authorization"] = "Basic " + [Convert]::ToBase64String($basicAuthBytes)
}

Write-Host "Indexer started. Scan root: $scanRoot"
Write-Host "Sync URL: $syncUrl"
Write-Host "Scan interval: $scanIntervalSeconds sec"
Write-Host "Max payload bytes: $maxPayloadBytes"
Write-Host "Request timeout: $requestTimeoutSeconds sec"
Write-Host "Retry count: $retryCount"
Write-Host "Retry delay: $retryDelaySeconds sec"
Write-Host "Disable keep-alive: $disableKeepAlive"
Write-Host "State file: $statePath"
Write-Host "Excluded files from scan: $($excludedPaths.Keys.Count)"

if (Test-IsLoopbackUrl -Url $serverUrl) {
  Write-Host "[$(Get-Date -Format o)] Warning: serverUrl points to localhost/loopback."
  Write-Host "[$(Get-Date -Format o)] If this indexer runs on another machine, localhost points to that machine itself, not to your production server."
}

$lastHash = Read-IndexerState -StatePath $statePath

if ($lastHash) {
  Write-Host "[$(Get-Date -Format o)] Loaded last snapshot hash from state file."
}

while ($true) {
  try {
    Write-Host "[$(Get-Date -Format o)] Scan started..."

    $invalidEntries = 0
    $files = @(Get-ChildItem -LiteralPath $scanRoot -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object {
        $fullPath = $_.FullName.ToLowerInvariant()
        -not $excludedPaths.ContainsKey($fullPath)
      } |
      ForEach-Object {
        $entry = Convert-ToIndexEntry -File $_ -ScanRoot $scanRoot
        if (-not $entry) {
          $invalidEntries++
        }

        $entry
      } |
      Where-Object { $null -ne $_ })

    $wireFiles = @()
    $invalidPayloadEntries = 0
    foreach ($file in $files) {
      $wireEntry = Convert-ToWireFileEntry -Entry $file
      if ($wireEntry) {
        $wireFiles += ,$wireEntry
      }
      else {
        $invalidPayloadEntries++
      }
    }

    Write-Host "[$(Get-Date -Format o)] Files discovered: $($files.Count)"
    if ($invalidEntries -gt 0) {
      Write-Host "[$(Get-Date -Format o)] Warning: skipped invalid file entries: $invalidEntries"
    }
    if ($invalidPayloadEntries -gt 0) {
      Write-Host "[$(Get-Date -Format o)] Warning: skipped invalid payload entries: $invalidPayloadEntries"
    }

    if ($files.Count -gt 0 -and $wireFiles.Count -eq 0) {
      Write-Host "[$(Get-Date -Format o)] Warning: all indexed files were filtered from payload. Sleeping for $scanIntervalSeconds sec."
      Start-Sleep -Seconds $scanIntervalSeconds
      continue
    }

    $snapshotHash = Get-SnapshotHash -Files $wireFiles

    if ($snapshotHash -eq $lastHash) {
      Write-Host "[$(Get-Date -Format o)] No changes detected. Sleeping for $scanIntervalSeconds sec."
      Start-Sleep -Seconds $scanIntervalSeconds
      continue
    }

    $payloadTemplate = @{
      MachineId = [string]$config.machineId
      RootPath = $scanRoot
      SnapshotHash = $snapshotHash
      Files = @()
    }

    $batches = Split-FileBatches -Files $wireFiles -PayloadTemplate $payloadTemplate -MaxPayloadBytes $maxPayloadBytes
    $totalChunks = $batches.Count
    $syncedChunks = 0

    Write-Host "[$(Get-Date -Format o)] Changes detected. Sending $totalChunks chunk(s)..."

    for ($i = 0; $i -lt $totalChunks; $i++) {
      $payload = $payloadTemplate.Clone()
      $chunkFiles = @($batches[$i])
      $payload.Files = $chunkFiles

      if ($totalChunks -gt 1) {
        $payload.ChunkIndex = $i + 1
        $payload.TotalChunks = $totalChunks
      }

      $json = $payload | ConvertTo-Json -Depth 6 -Compress
      Invoke-SyncRequest -Uri $syncUrl -Headers $headers -Body $json -TimeoutSec $requestTimeoutSeconds -RetryCount $retryCount -RetryDelaySeconds $retryDelaySeconds -DisableKeepAlive $disableKeepAlive
      Write-Host "[$(Get-Date -Format o)] Synced chunk $($i + 1)/$totalChunks, files: $($chunkFiles.Count)"
      $syncedChunks++
    }

    if ($syncedChunks -lt $totalChunks) {
      Write-Host "[$(Get-Date -Format o)] Warning: synced only $syncedChunks of $totalChunks chunks. Snapshot hash will not be persisted, retry on next cycle."
      Start-Sleep -Seconds $scanIntervalSeconds
      continue
    }

    $lastHash = $snapshotHash
    Write-IndexerState -StatePath $statePath -SnapshotHash $snapshotHash
  }
  catch {
    $err = $_
    $response = Get-ExceptionResponse -Exception $err.Exception
    if ($response -and $response.StatusCode) {
      $statusCode = [int]$response.StatusCode
      Write-Host "[$(Get-Date -Format o)] Error: Remote server returned an error: ($statusCode) $($response.StatusDescription)."
      $errorDetails = Get-HttpErrorDetails -ErrorRecord $err
      if ($errorDetails) {
        Write-Host "[$(Get-Date -Format o)] Server response body: $errorDetails"
      }
    }
    else {
      Write-Host "[$(Get-Date -Format o)] Error: $($err.Exception.Message)"
    }
  }

  Start-Sleep -Seconds $scanIntervalSeconds
}
