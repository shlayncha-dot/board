# CurlThin native DLLs (Windows x64)

Сюда нужно положить нативные библиотеки из вашей OpenSSL-сборки `curl.exe`.

Минимум:
- `libcurl*.dll`
- `libssl*.dll`
- `libcrypto*.dll`

И также все зависимости, которые лежат рядом в `bin` вашей сборки curl
(`zlib1.dll`, `zstd.dll`, `brotli*.dll`, `nghttp2.dll` и т.д. — зависит от конкретного билда).

## Куда можно копировать прямо сейчас
Для быстрого локального теста можно копировать прямо в папку запуска:

`C:\Users\User\source\repos\SLS-Planning-1C-v2\SLS-Planning-1C.Server\bin\Debug\net8.0`

Но правильнее класть DLL в эту папку (`native/win-x64`), потому что `.csproj`
автоматически скопирует их в `bin` при сборке.

## Важно
Файлы `*.a` (например, `libssl.a`) — это не runtime DLL.
Для запуска .NET нужны именно файлы `*.dll`.
