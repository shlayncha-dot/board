@echo off
setlocal

set "SERVER_URL=%~1"
if "%SERVER_URL%"=="" set "SERVER_URL=http://localhost:5000"

set "TEST_ENDPOINT=%SERVER_URL%/api/file-index/test"
set "PAYLOAD_FILE=%TEMP%\sls_test_index_payload.json"

(
  echo {
  echo   "fileName": "test-file.pdf"
  echo }
) > "%PAYLOAD_FILE%"

echo [INFO] Надсилаю тестовий файл на %TEST_ENDPOINT%
for /f "usebackq delims=" %%R in (`curl -sS -X POST "%TEST_ENDPOINT%" -H "Content-Type: application/json" --data-binary "@%PAYLOAD_FILE%"`) do set "RESPONSE=%%R"

del "%PAYLOAD_FILE%" >nul 2>nul

if "%RESPONSE%"=="Дякую" (
  echo [OK] Сервер відповів: %RESPONSE%
  exit /b 0
)

echo [ERROR] Неочікувана відповідь сервера: %RESPONSE%
exit /b 1
