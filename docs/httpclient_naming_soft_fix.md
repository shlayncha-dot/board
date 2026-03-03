# Нейминг API: «мягкая» стабилизация HttpClient + путь на CurlThin

Если API нейминга работает через `curl`, но нестабильно через `HttpClient`, сначала попробуйте «мягкий» вариант — подстроить HTTP-профиль .NET под поведение старых серверов.

## Что уже добавлено в код

В `NamingService` добавлены настройки совместимости:

- `UserAgent` (по умолчанию `curl/8.4.0`),
- `DisableExpectContinue` (по умолчанию `true`),
- `DisableChunkedEncoding` (по умолчанию `true`),
- `ForceConnectionClose` (по умолчанию `true`).

Также отправка запроса теперь:

- фиксирует `Accept: application/json`,
- использует HTTP `VersionPolicy = RequestVersionOrLower` (сервер может откатиться до поддерживаемой версии),
- при `DisableChunkedEncoding = true` передаёт явный `Content-Length`.

Это часто решает проблемы с legacy API, которые не принимают chunked/Expect: 100-continue или слишком «новый» сетевой профиль клиента.

## Как настраивать

`SLS-Planning-1C.Server/appsettings.json`:

```json
{
  "ExternalApis": {
    "Naming": {
      "CheckUrl": "https://...",
      "Username": "...",
      "Password": "...",
      "IgnoreSslErrors": false,
      "UserAgent": "curl/8.4.0",
      "DisableExpectContinue": true,
      "DisableChunkedEncoding": true,
      "ForceConnectionClose": true
    }
  }
}
```

### Рекомендуемый порядок диагностики

1. Оставить все флаги совместимости включёнными (как сейчас).
2. Если заработало — по одному отключать флаги, чтобы найти минимально необходимый набор.
3. Если не заработало — проверять TLS/сертификаты (они уже покрыты TLS fallback в `NamingService`).
4. Если всё ещё не работает — переходить на путь с `libcurl`.

---

## Путь 2: подключить Curl напрямую в код (NuGet `CurlThin`)

Если нужен максимально «curl-совместимый» стек в .NET, из списка на скриншоте выбирайте:

1. **`CurlThin` от `stl`** — это основной managed wrapper (его ставим обязательно).
2. Дальше один из двух вариантов:
   - **A. Ручные native-библиотеки (рекомендуется для вашего кейса OpenSSL):**
     - оставляете только `CurlThin`,
     - копируете свои `libcurl.dll` + зависимые `libssl/libcrypto` в output приложения.
   - **B. Готовые native-библиотеки из NuGet:**
     - дополнительно ставите **`CurlThin.Native` от `stl`**,
     - ручное копирование `libcurl.dll` обычно не нужно.

Итого коротко: **минимум — `CurlThin`**, а **`CurlThin.Native`** ставьте только если хотите брать native DLL из NuGet, а не из вашего установленного curl.

### Важно

- `CurlThin` хорош как fallback для нестандартных API, но усложняет деплой.
- Для production лучше сначала добиться стабильности через `HttpClient` (что и сделано этим патчем).
- Если сервер требует полностью «поведение curl/OpenSSL», тогда `CurlThin` — рабочий вариант.
