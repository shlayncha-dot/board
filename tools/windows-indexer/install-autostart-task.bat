@echo off
setlocal

set TASK_NAME=SLS_FileIndexer
set SCRIPT_DIR=%~dp0
set BAT_PATH=%SCRIPT_DIR%run-indexer.bat

if not exist "%BAT_PATH%" (
  echo [ERROR] run-indexer.bat not found.
  exit /b 1
)

schtasks /Create /TN "%TASK_NAME%" /TR "\"%BAT_PATH%\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 (
  echo [ERROR] Unable to create scheduled task.
  exit /b 1
)

echo [OK] Task "%TASK_NAME%" created. It will start automatically on Windows startup.
endlocal
