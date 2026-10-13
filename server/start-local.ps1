#Requires -Version 5.1
<#
  Hydra roda exclusivamente na VPS.
  Use start_vps_turbo.ps1 na maquina de producao.
#>
Write-Host "Este projeto e VPS-only." -ForegroundColor Yellow
Write-Host "Na VPS, use: .\start_vps_turbo.ps1" -ForegroundColor Cyan
Write-Host "Sync PC->VPS: scripts\sync-silent-vnc-to-vps.ps1 -Export -Zip" -ForegroundColor DarkGray
exit 1
