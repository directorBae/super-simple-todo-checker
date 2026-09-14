param([switch]$StatusOnly)
$ErrorActionPreference = 'Stop'

function Show-ServerMonitor {
    param([string]$ServerFolder, [switch]$Once)
    Write-Host ''
    Write-Host 'TODO SERVER - RUNNING' -ForegroundColor Green
    Write-Host 'PC:    http://localhost:8787'
    $taskNetworks = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' })
    foreach ($taskNetwork in $taskNetworks) {
        foreach ($taskAddress in $taskNetwork.IPv4Address) {
            Write-Host ('Phone: http://' + $taskAddress.IPAddress + ':8787') -ForegroundColor Cyan
        }
    }
    Write-Host "Data:  $ServerFolder\data"
    Write-Host 'This window monitors the existing server. It does not start a second server.'
    Write-Host 'Ctrl+C closes this monitor; the background server keeps running.'
    Write-Host ''
    $taskPrevious = ''
    do {
        $taskHealthy = $false
        try {
            $taskReply = Invoke-RestMethod 'http://127.0.0.1:8787/health' -TimeoutSec 3
            $taskHealthy = $taskReply.ok -eq $true -and $taskReply.name -eq 'todo-checker-sync'
        } catch { }
        $taskStatus = if ($taskHealthy) { 'ONLINE - server is responding' } else { 'OFFLINE - server is not responding; restart the saved server' }
        if ($taskStatus -ne $taskPrevious -or $Once) {
            Write-Host ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $taskStatus) -ForegroundColor $(if ($taskHealthy) { 'Green' } else { 'Red' })
            $taskPrevious = $taskStatus
        } else {
            Write-Host ('  Last checked: {0}    ' -f (Get-Date -Format 'HH:mm:ss')) -NoNewline
            Write-Host "`r" -NoNewline
        }
        if ($Once) { return }
        Start-Sleep -Seconds 3
    } while ($true)
}
$taskLocationFile = Join-Path $env:LOCALAPPDATA 'todo-checker\server-location.json'
$taskServerFolder = $PSScriptRoot
try {
    if (Test-Path -LiteralPath $taskLocationFile) {
        $taskLocation = Get-Content -LiteralPath $taskLocationFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $taskServerFolder = [IO.Path]::GetFullPath($taskLocation.directory)
        if (-not (Test-Path -LiteralPath (Join-Path $taskServerFolder 'index.js'))) {
            throw "The saved server folder is missing: $taskServerFolder. Restore that folder to keep your data and connections."
        }
    }
    $taskHealth = $null
    try { $taskHealth = Invoke-RestMethod 'http://127.0.0.1:8787/health' -TimeoutSec 3 } catch { }
    if ($taskHealth.ok -eq $true -and $taskHealth.name -eq 'todo-checker-sync') {
        Show-ServerMonitor -ServerFolder $taskServerFolder -Once:$StatusOnly
        exit 0
    }
    if ($StatusOnly) { throw 'TODO server is not responding on port 8787.' }
    $taskListeners = @(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)
    if ($taskListeners.Count -gt 0) {
        throw 'Port 8787 is occupied, but the TODO server did not respond. No additional server was started. Retry after checking the running server.'
    }
    $taskEnv = Join-Path $taskServerFolder '.env'
    if (-not (Test-Path -LiteralPath $taskEnv)) {
        Copy-Item -LiteralPath (Join-Path $taskServerFolder '.env.example') -Destination $taskEnv
    }
    $taskRuntime = Join-Path $taskServerFolder 'runtime\node.exe'
    if (-not (Test-Path -LiteralPath $taskRuntime)) { $taskRuntime = (Get-Command node -ErrorAction Stop).Source }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskLocationFile) | Out-Null
    @{ directory = $taskServerFolder } | ConvertTo-Json | Set-Content -LiteralPath $taskLocationFile -Encoding UTF8
    Write-Host 'TODO server: http://localhost:8787'
    Write-Host "Using saved server folder: $taskServerFolder"
    Write-Host 'Keep this window open while using the app.'
    Set-Location -LiteralPath $taskServerFolder
    & $taskRuntime (Join-Path $taskServerFolder 'index.js')
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
