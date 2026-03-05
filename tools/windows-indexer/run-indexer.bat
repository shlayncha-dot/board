@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CONFIG_FILE=%SCRIPT_DIR%config.json"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL_EXE%" (
  echo [ERROR] powershell.exe not found at "%POWERSHELL_EXE%".
  exit /b 1
)

if not exist "%CONFIG_FILE%" (
  echo [ERROR] config.json not found. Copy config.json.example to config.json and update settings.
  exit /b 1
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%indexer.ps1" -ConfigPath "%CONFIG_FILE%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Indexer stopped with exit code %EXIT_CODE%.
)

endlocal & exit /b %EXIT_CODE%
