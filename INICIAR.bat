@echo off
chcp 65001 >nul
setlocal

echo.
echo  ============================================================
echo    GANGSTAR 3.5 - SETUP AUTOMATICO + INICIAR SERVIDOR
echo  ============================================================
echo.

set "ROOT=%~dp0"
set "PS1=%ROOT%finalvnc\setup_automatico.ps1"

if not exist "%PS1%" (
    echo [ERRO] Script nao encontrado: %PS1%
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Start

if errorlevel 1 (
    echo.
    echo [ERRO] Setup falhou. Veja finalvnc\PENDENCIAS_MANUAIS.txt
    pause
    exit /b 1
)

pause
