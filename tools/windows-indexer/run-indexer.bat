@echo off
setlocal

set SCRIPT_DIR=%~dp0
set CONFIG_FILE=%SCRIPT_DIR%config.json

if not exist "%CONFIG_FILE%" (
  echo [ERROR] config.json not found. Copy config.json.example to config.json and update settings.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%indexer.ps1" -ConfigPath "%CONFIG_FILE%"

endlocal
