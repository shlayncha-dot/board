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
    if (-not $state) {
      return $null
    }

    $lastSnapshotHash = if ($state.PSObject.Properties.Name -contains 'LastSnapshotHash') { [string]$state.LastSnapshotHash } else { $null }
    $fileIndex = @{}

    if ($state.PSObject.Properties.Name -contains 'Files' -and $state.Files) {
      foreach ($entry in @($state.Files)) {
        if (-not $entry) { continue }

        $wireEntry = Convert-ToWireFileEntry -Entry $entry
        if (-not $wireEntry) { continue }

        $relativePath = [string]$wireEntry.RelativePath
        if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }
        $fileIndex[$relativePath.ToLowerInvariant()] = $wireEntry
      }
    }

    return [pscustomobject]@{
      LastSnapshotHash = $lastSnapshotHash
      Files = $fileIndex
    }
  }
  catch {
    Write-Host "[$(Get-Date -Format o)] Warning: failed to read state file '$StatePath'."
    return $null
  }
}

function Write-IndexerState([string]$StatePath, [string]$SnapshotHash, [array]$Files) {
  $state = [ordered]@{
    LastSnapshotHash = $SnapshotHash
    UpdatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    Files = @($Files)
  }

  $json = $state | ConvertTo-Json -Depth 8
  Set-Content -LiteralPath $StatePath -Value $json -Encoding UTF8
}

function Get-EntryFingerprint([object]$Entry) {
  if (-not $Entry) {
    return ''
  }

  $relativePath = Convert-ToSafeString $Entry.RelativePath
  $extension = Convert-ToSafeString $Entry.Extension
  $lastWriteTimeUtc = Convert-ToSafeString $Entry.LastWriteTimeUtc

  $sizeBytes = 0L
  try {
    $sizeBytes = [int64]$Entry.SizeBytes
  }
  catch {
    return ''
  }

  return "{0}|{1}|{2}|{3}" -f $relativePath, $sizeBytes, $extension, $lastWriteTimeUtc
}

function Build-DeltaPayload(
  [string]$MachineId,
  [string]$RootPath,
  [string]$BaseSnapshotHash,
  [string]$NewSnapshotHash,
  [hashtable]$PreviousFilesByPath,
  [array]$CurrentWireFiles
) {
  $currentByPath = @{}
  foreach ($file in $CurrentWireFiles) {
    if (-not $file) { continue }

    $relativePath = Convert-ToSafeString $file.RelativePath
    if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }
    $currentByPath[$relativePath.ToLowerInvariant()] = $file
  }

  $addedOrUpdated = [System.Collections.Generic.List[object]]::new()
  foreach ($kv in $currentByPath.GetEnumerator()) {
    $key = $kv.Key
    $current = $kv.Value

    if (-not $PreviousFilesByPath.ContainsKey($key)) {
      $addedOrUpdated.Add($current)
      continue
    }

    $previous = $PreviousFilesByPath[$key]
    if ((Get-EntryFingerprint -Entry $current) -ne (Get-EntryFingerprint -Entry $previous)) {
      $addedOrUpdated.Add($current)
    }
  }

  $deleted = [System.Collections.Generic.List[string]]::new()
  foreach ($kv in $PreviousFilesByPath.GetEnumerator()) {
    if (-not $currentByPath.ContainsKey($kv.Key)) {
      $deleted.Add([string]$kv.Value.RelativePath)
    }
  }

  return [ordered]@{
    MachineId = $MachineId
    RootPath = $RootPath
    BaseSnapshotHash = $BaseSnapshotHash
    NewSnapshotHash = $NewSnapshotHash
    AddedOrUpdatedFiles = @($addedOrUpdated.ToArray())
    DeletedRelativePaths = @($deleted.ToArray())
  }
}

function Get-PayloadSizeBytes([hashtable]$Payload, [int]$Depth) {
  $json = $Payload | ConvertTo-Json -Depth $Depth -Compress
  return [System.Text.Encoding]::UTF8.GetByteCount($json)
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

function Split-FileBatches(
  [array]$Files,
  [hashtable]$PayloadTemplate,
  [int]$MaxPayloadBytes,
  [int]$ChunkMetadataOverheadBytes
) {
  if ($Files.Count -eq 0) {
    return @()
  }

  $batches = @()
  $current = @()
  $sizeLimit = $MaxPayloadBytes - [Math]::Max(0, $ChunkMetadataOverheadBytes)

  if ($sizeLimit -le 0) {
    throw "Config 'maxPayloadBytes' must be greater than 'chunkMetadataOverheadBytes'."
  }

  foreach ($file in $Files) {
    $candidate = @($current + @($file))
    $payload = $PayloadTemplate.Clone()
    $payload.Files = $candidate
    $size = Get-PayloadSizeBytes -Payload $payload -Depth 6

    if ($size -gt $sizeLimit -and $current.Count -eq 0) {
      throw "A single file entry exceeds max payload size. Increase 'maxPayloadBytes' or reduce entry metadata size."
    }

    if ($size -gt $sizeLimit -and $current.Count -gt 0) {
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


function Test-ShouldFallbackToFullSync([System.Management.Automation.ErrorRecord]$ErrorRecord) {
  if (-not $ErrorRecord -or -not $ErrorRecord.Exception) {
    return $false
  }

  $response = Get-ExceptionResponse -Exception $ErrorRecord.Exception
  if (-not $response -or -not $response.StatusCode) {
    return $false
  }

  $statusCode = [int]$response.StatusCode
  if ($statusCode -ne 400 -and $statusCode -ne 404 -and $statusCode -ne 409) {
    return $false
  }

  $details = Get-HttpErrorDetails -ErrorRecord $ErrorRecord
  if ([string]::IsNullOrWhiteSpace($details)) {
    return $false
  }

  $detailsLower = $details.ToLowerInvariant()

  if ($detailsLower.Contains('snapshot') -and ($detailsLower.Contains('conflict') -or $detailsLower.Contains('mismatch'))) {
    return $true
  }

  if ($detailsLower.Contains('full') -and ($detailsLower.Contains('resync') -or $detailsLower.Contains('re-sync') -or $detailsLower.Contains('resynchronization'))) {
    return $true
  }

  if ($detailsLower.Contains('snapshot') -and ($detailsLower.Contains('not found') -or $detailsLower.Contains('missing'))) {
    return $true
  }

  return $false
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


function Should-WriteCycleLog([bool]$EmitCycleLogs) {
  return $EmitCycleLogs
}

function Test-IsIncludedExtension([string]$Extension, [hashtable]$AllowedExtensions) {
  if (-not $AllowedExtensions -or $AllowedExtensions.Count -eq 0) {
    return $true
  }

  if ([string]::IsNullOrWhiteSpace($Extension)) {
    return $false
  }

  return $AllowedExtensions.ContainsKey($Extension.ToLowerInvariant())
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
$syncDeltaEndpoint = if ($config.PSObject.Properties.Name -contains 'syncDeltaEndpoint' -and $config.syncDeltaEndpoint) { if ([string]$config.syncDeltaEndpoint -like '/*') { [string]$config.syncDeltaEndpoint } else { "/$($config.syncDeltaEndpoint)" } } else { "/api/file-index/sync-delta" }
$syncDeltaUrl = "$serverUrl$syncDeltaEndpoint"

$scanIntervalSeconds = if ($null -ne $config.scanIntervalSeconds) { [int]$config.scanIntervalSeconds } else { 30 }
$maxPayloadBytes = if ($null -ne $config.maxPayloadBytes) { [int]$config.maxPayloadBytes } else { 800000 }
$chunkMetadataOverheadBytes = if ($null -ne $config.chunkMetadataOverheadBytes) { [int]$config.chunkMetadataOverheadBytes } else { 512 }
$requestTimeoutSeconds = if ($null -ne $config.requestTimeoutSeconds) { [int]$config.requestTimeoutSeconds } else { 30 }
$retryCount = if ($null -ne $config.retryCount) { [int]$config.retryCount } else { 3 }
$retryDelaySeconds = if ($null -ne $config.retryDelaySeconds) { [int]$config.retryDelaySeconds } else { 3 }
$disableKeepAlive = if ($null -ne $config.disableKeepAlive) { [bool]$config.disableKeepAlive } else { $true }
$emitCycleLogs = if ($null -ne $config.emitCycleLogs) { [bool]$config.emitCycleLogs } else { $true }
$enableDeltaSync = if ($null -ne $config.enableDeltaSync) { [bool]$config.enableDeltaSync } else { $true }

$allowedExtensions = @{}
if ($config.PSObject.Properties.Name -contains 'includeExtensions' -and $config.includeExtensions) {
  foreach ($rawExtension in @($config.includeExtensions)) {
    if ($null -eq $rawExtension) {
      continue
    }

    $extension = ([string]$rawExtension).Trim()
    if ([string]::IsNullOrWhiteSpace($extension)) {
      continue
    }

    if (-not $extension.StartsWith('.')) {
      $extension = "." + $extension
    }

    $allowedExtensions[$extension.ToLowerInvariant()] = $true
  }
}

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
Write-Host "Delta sync URL: $syncDeltaUrl"
Write-Host "Scan interval: $scanIntervalSeconds sec"
Write-Host "Max payload bytes: $maxPayloadBytes"
Write-Host "Chunk metadata overhead bytes: $chunkMetadataOverheadBytes"
Write-Host "Request timeout: $requestTimeoutSeconds sec"
Write-Host "Retry count: $retryCount"
Write-Host "Retry delay: $retryDelaySeconds sec"
Write-Host "Disable keep-alive: $disableKeepAlive"
Write-Host "State file: $statePath"
Write-Host "Excluded files from scan: $($excludedPaths.Keys.Count)"
Write-Host "Emit cycle logs: $emitCycleLogs"
Write-Host "Enable delta sync: $enableDeltaSync"
if ($allowedExtensions.Count -gt 0) {
  Write-Host "Included extensions filter: $($allowedExtensions.Keys -join ", ")"
}

if (Test-IsLoopbackUrl -Url $serverUrl) {
  Write-Host "[$(Get-Date -Format o)] Warning: serverUrl points to localhost/loopback."
  Write-Host "[$(Get-Date -Format o)] If this indexer runs on another machine, localhost points to that machine itself, not to your production server."
}

$state = Read-IndexerState -StatePath $statePath
$lastHash = if ($state) { [string]$state.LastSnapshotHash } else { $null }
$lastFilesByPath = if ($state -and $state.Files) { $state.Files } else { @{} }

if ($lastHash) {
  Write-Host "[$(Get-Date -Format o)] Loaded last snapshot hash from state file."
}

while ($true) {
  try {
    if (Should-WriteCycleLog -EmitCycleLogs $emitCycleLogs) {
      Write-Host "[$(Get-Date -Format o)] Scan started..."
    }

    $invalidEntries = 0
    $files = @(Get-ChildItem -LiteralPath $scanRoot -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object {
        $fullPath = $_.FullName.ToLowerInvariant()
        if ($excludedPaths.ContainsKey($fullPath)) {
          return $false
        }

        return Test-IsIncludedExtension -Extension $_.Extension -AllowedExtensions $allowedExtensions
      } |
      ForEach-Object {
        $entry = Convert-ToIndexEntry -File $_ -ScanRoot $scanRoot
        if (-not $entry) {
          $invalidEntries++
        }

        $entry
      } |
      Where-Object { $null -ne $_ })

    $wireFilesList = [System.Collections.Generic.List[object]]::new()
    $invalidPayloadEntries = 0
    foreach ($file in $files) {
      $wireEntry = Convert-ToWireFileEntry -Entry $file
      if ($wireEntry) {
        $wireFilesList.Add($wireEntry)
      }
      else {
        $invalidPayloadEntries++
      }
    }
    $wireFiles = @($wireFilesList.ToArray())

    if (Should-WriteCycleLog -EmitCycleLogs $emitCycleLogs) {
      Write-Host "[$(Get-Date -Format o)] Files discovered: $($files.Count)"
    }
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
      if (Should-WriteCycleLog -EmitCycleLogs $emitCycleLogs) {
        Write-Host "[$(Get-Date -Format o)] No changes detected. Sleeping for $scanIntervalSeconds sec."
      }
      Start-Sleep -Seconds $scanIntervalSeconds
      continue
    }

    $canUseDelta = $enableDeltaSync -and -not [string]::IsNullOrWhiteSpace($lastHash) -and $lastFilesByPath.Count -ge 0
    $deltaSent = $false

    if ($canUseDelta) {
      $deltaPayload = Build-DeltaPayload -MachineId ([string]$config.machineId) -RootPath $scanRoot -BaseSnapshotHash $lastHash -NewSnapshotHash $snapshotHash -PreviousFilesByPath $lastFilesByPath -CurrentWireFiles $wireFiles
      $deltaJson = $deltaPayload | ConvertTo-Json -Depth 8 -Compress
      $deltaBytes = [System.Text.Encoding]::UTF8.GetByteCount($deltaJson)

      if ($deltaBytes -le $maxPayloadBytes) {
        if (Should-WriteCycleLog -EmitCycleLogs $emitCycleLogs) {
          Write-Host "[$(Get-Date -Format o)] Changes detected. Sending delta (added/updated: $($deltaPayload.AddedOrUpdatedFiles.Count), deleted: $($deltaPayload.DeletedRelativePaths.Count))."
        }

        try {
          Invoke-SyncRequest -Uri $syncDeltaUrl -Headers $headers -Body $deltaJson -TimeoutSec $requestTimeoutSeconds -RetryCount $retryCount -RetryDelaySeconds $retryDelaySeconds -DisableKeepAlive $disableKeepAlive
          $deltaSent = $true
        }
        catch {
          if (Test-ShouldFallbackToFullSync -ErrorRecord $_) {
            Write-Host "[$(Get-Date -Format o)] Delta rejected by server (state mismatch). Switching to full sync in this cycle."
            $deltaSent = $false
          }
          else {
            throw
          }
        }
      }
      elseif (Should-WriteCycleLog -EmitCycleLogs $emitCycleLogs) {
        Write-Host "[$(Get-Date -Format o)] Delta payload is too large ($deltaBytes bytes). Fallback to full sync."
      }
    }

    if (-not $deltaSent) {
      $payloadTemplate = @{
        MachineId = [string]$config.machineId
        RootPath = $scanRoot
        SnapshotHash = $snapshotHash
        Files = @()
      }

      $batches = Split-FileBatches -Files $wireFiles -PayloadTemplate $payloadTemplate -MaxPayloadBytes $maxPayloadBytes -ChunkMetadataOverheadBytes $chunkMetadataOverheadBytes
      $totalChunks = $batches.Count
      $syncedChunks = 0

      if (Should-WriteCycleLog -EmitCycleLogs $emitCycleLogs) {
        Write-Host "[$(Get-Date -Format o)] Changes detected. Sending full sync with $totalChunks chunk(s)..."
      }

      for ($i = 0; $i -lt $totalChunks; $i++) {
        $payload = $payloadTemplate.Clone()
        $chunkFiles = $batches[$i]
        $payload.Files = $chunkFiles

        if ($totalChunks -gt 1) {
          $payload.ChunkIndex = $i + 1
          $payload.TotalChunks = $totalChunks
        }

        $json = $payload | ConvertTo-Json -Depth 6 -Compress
        Invoke-SyncRequest -Uri $syncUrl -Headers $headers -Body $json -TimeoutSec $requestTimeoutSeconds -RetryCount $retryCount -RetryDelaySeconds $retryDelaySeconds -DisableKeepAlive $disableKeepAlive
        if (Should-WriteCycleLog -EmitCycleLogs $emitCycleLogs) {
          Write-Host "[$(Get-Date -Format o)] Synced chunk $($i + 1)/$totalChunks, files: $($chunkFiles.Count)"
        }
        $syncedChunks++
      }

      if ($syncedChunks -lt $totalChunks) {
        Write-Host "[$(Get-Date -Format o)] Warning: synced only $syncedChunks of $totalChunks chunks. Snapshot hash will not be persisted, retry on next cycle."
        Start-Sleep -Seconds $scanIntervalSeconds
        continue
      }
    }

    $lastHash = $snapshotHash
    $lastFilesByPath = @{}
    foreach ($wf in $wireFiles) {
      if ($wf -and $wf.RelativePath) {
        $lastFilesByPath[[string]$wf.RelativePath.ToLowerInvariant()] = $wf
      }
    }

    Write-IndexerState -StatePath $statePath -SnapshotHash $snapshotHash -Files $wireFiles
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
