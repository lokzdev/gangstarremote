# ============================================================
#   Hydra Server — VPS (PostgreSQL + uvicorn turbo)
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   Hydra Server — VPS" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

Write-Host "[1/4] Parando processos anteriores..." -ForegroundColor Yellow
taskkill /F /IM python.exe 2>$null
Start-Sleep -Seconds 2

Write-Host "[2/4] Configurando ambiente..." -ForegroundColor Yellow
$env:PYTHONOPTIMIZE = "2"
$env:PYTHONASYNCIODEBUG = "0"
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONUNBUFFERED = "1"
$env:FRAME_TTL_SECONDS = "60"
$env:HIERARCHY_TTL_SECONDS = "30"
$env:DASHBOARD_QUEUE_SIZE = "10"
$env:HYDRA_UVICORN_WORKERS = "4"

if (Test-Path ".env.vps") {
    Get-Content ".env.vps" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "=") {
            $k, $v = $line -split "=", 2
            Set-Item -Path "env:$($k.Trim())" -Value $v.Trim().Trim('"').Trim("'")
        }
    }
}

if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgresql://postgres:1111@localhost:5432/rat_db"
}
if (-not $env:SERVER_URL) {
    $env:SERVER_URL = "http://151.243.137.239:7771"
}

Write-Host "[3/4] Build frontend (web-dist)..." -ForegroundColor Yellow
Push-Location "web-app"
try {
    if (-not (Test-Path "node_modules")) { npm install }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build falhou" }
} finally {
    Pop-Location
}

Write-Host "[4/4] Iniciando servidor..." -ForegroundColor Yellow
Write-Host "   Porta: 7771 | Workers: 4 | DB: PostgreSQL" -ForegroundColor White
Write-Host "   Painel: $env:SERVER_URL" -ForegroundColor Green
Write-Host ""

python -m uvicorn main:app `
    --host 0.0.0.0 `
    --port 7771 `
    --workers 4 `
    --http httptools `
    --ws websockets `
    --ws-max-size 16777216 `
    --timeout-keep-alive 120 `
    --limit-concurrency 1000 `
    --backlog 2048
