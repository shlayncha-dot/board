@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "TARGET_SCRIPT=%SCRIPT_DIR%tools\windows-indexer\run-indexer.bat"

if not exist "%TARGET_SCRIPT%" (
  echo [ERROR] Не знайдено "%TARGET_SCRIPT%".
  echo [INFO] Запустіть цей файл із кореня репозиторію SLS-Planning-1C.
  exit /b 1
)

call "%TARGET_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %EXIT_CODE%
