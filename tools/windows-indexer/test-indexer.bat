@echo off
setlocal

set "SERVER_URL=https://sls-planning.omnic.pro"
set "TEST_ENDPOINT=%SERVER_URL%/api/file-index/test"
set "PAYLOAD_FILE=%TEMP%\sls_test_index_payload.json"

where curl >nul 2>nul
if errorlevel 1 (
  echo [ERROR] У системі не знайдено curl.exe.
  echo [INFO] Потрібен Windows 10/11 з вбудованим curl або встановіть curl у PATH.
  exit /b 1
)

(
  echo {
  echo   "fileName": "test-file.pdf"
  echo }
) > "%PAYLOAD_FILE%"

echo [INFO] Надсилаю тестовий файл на %TEST_ENDPOINT%
for /f "usebackq delims=" %%R in (`curl -sS -X POST "%TEST_ENDPOINT%" -H "Content-Type: application/json" --data-binary "@%PAYLOAD_FILE%"`) do set "RESPONSE=%%R"

set "CURL_EXIT=%ERRORLEVEL%"

del "%PAYLOAD_FILE%" >nul 2>nul

if not "%CURL_EXIT%"=="0" (
  echo [ERROR] Помилка запиту до сервера. Код curl: %CURL_EXIT%
  exit /b 1
)

if "%RESPONSE%"=="Дякую" (
  echo [OK] Сервер відповів: %RESPONSE%
  exit /b 0
)

echo [ERROR] Неочікувана відповідь сервера: %RESPONSE%
exit /b 1
