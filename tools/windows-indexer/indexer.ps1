param(
    [string]$ConfigPath = "$PSScriptRoot\config.json"
)

$ErrorActionPreference = 'Stop'

function Get-Config {
    param([string]$Path)

    if (!(Test-Path $Path)) {
        throw "Файл конфигурации не найден: $Path"
    }

    return Get-Content $Path -Raw | ConvertFrom-Json
}

function Get-RelativePath {
    param(
        [string]$BasePath,
        [string]$TargetPath
    )

    $baseUri = New-Object System.Uri(($BasePath.TrimEnd('\\') + '\\'))
    $targetUri = New-Object System.Uri($TargetPath)
    $relative = $baseUri.MakeRelativeUri($targetUri).ToString()
    return [System.Uri]::UnescapeDataString($relative.Replace('/', '\\'))
}

function Get-IndexedFiles {
    param(
        [string]$RootPath,
        [string]$BasePath
    )

    $files = Get-ChildItem -Path $RootPath -Recurse -File |
        Where-Object { $_.Extension -in @('.pdf', '.dxf', '.PDF', '.DXF') } |
        Sort-Object FullName

    return $files | ForEach-Object {
        [PSCustomObject]@{
            fileName = $_.Name
            relativePath = Get-RelativePath -BasePath $BasePath -TargetPath $_.FullName
            extension = $_.Extension.ToLowerInvariant()
            lastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
            sizeBytes = $_.Length
        }
    }
}

function Get-SnapshotHash {
    param($Files)

    $raw = ($Files | ConvertTo-Json -Depth 6 -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return ([BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
}

function Send-Snapshot {
    param(
        [string]$ServerUrl,
        [string]$Endpoint,
        [string]$MachineId,
        [string]$RootPath,
        [string]$SnapshotHash,
        $Files
    )

    $payload = @{
        machineId = $MachineId
        rootPath = $RootPath
        snapshotHash = $SnapshotHash
        files = $Files
    }

    $url = ($ServerUrl.TrimEnd('/') + '/' + $Endpoint.TrimStart('/'))
    return Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 8)
}

$config = Get-Config -Path $ConfigPath
$basePath = $PSScriptRoot
$scanRoot = Resolve-Path (Join-Path $basePath $config.scanRoot)
$lastHash = ''

Write-Host "Индексация запущена. Корень сканирования: $scanRoot"

while ($true) {
    try {
        $files = Get-IndexedFiles -RootPath $scanRoot -BasePath $basePath
        $hash = Get-SnapshotHash -Files $files

        if ($hash -ne $lastHash) {
            $result = Send-Snapshot `
                -ServerUrl $config.serverUrl `
                -Endpoint $config.syncEndpoint `
                -MachineId $config.machineId `
                -RootPath $scanRoot `
                -SnapshotHash $hash `
                -Files $files

            if ($result.updated -eq $true) {
                Write-Host "[$(Get-Date -Format 's')] Обновлено файлов: $($result.fileCount)"
            }

            $lastHash = $hash
        }
    }
    catch {
        Write-Host "[$(Get-Date -Format 's')] Ошибка: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds ([int]$config.scanIntervalSeconds)
}
