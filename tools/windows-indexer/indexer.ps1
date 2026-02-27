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

function Assert-Config {
    param($Config)

    if (-not ($Config.serverUrl -is [string]) -or [string]::IsNullOrWhiteSpace($Config.serverUrl)) {
        throw "Параметр config.serverUrl должен быть непустой строкой, например: http://localhost:5197"
    }

    if (-not ($Config.syncEndpoint -is [string]) -or [string]::IsNullOrWhiteSpace($Config.syncEndpoint)) {
        throw "Параметр config.syncEndpoint должен быть непустой строкой, например: /api/file-index/sync"
    }

    if (-not ($Config.scanRoot -is [string]) -or [string]::IsNullOrWhiteSpace($Config.scanRoot)) {
        throw "Параметр config.scanRoot должен быть непустой строкой, например: ."
    }

    if (-not ($Config.machineId -is [string]) -or [string]::IsNullOrWhiteSpace($Config.machineId)) {
        throw "Параметр config.machineId должен быть непустой строкой"
    }

    if (-not ($Config.scanIntervalSeconds -as [int]) -or [int]$Config.scanIntervalSeconds -le 0) {
        throw "Параметр config.scanIntervalSeconds должен быть числом больше 0"
    }
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
Assert-Config -Config $config
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
