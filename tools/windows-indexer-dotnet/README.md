# Windows indexer (.NET Worker + SQLite)

Новый индексатор совместим с текущим серверным API:
- `POST /api/file-index/sync`
- `POST /api/file-index/sync-delta`
- `POST /api/file-index/clear`

Дополнительно в программу встроен локальный preview-gateway для PDF/DXF:
- `GET /health`
- `GET /pdf?path=<absolute_or_unc_path>`
- `GET /pdf?relativePath=<path_relative_to_scanRoot>`
- `GET /document?...` (alias на тот же обработчик)

## Что внутри
- `WindowsIndexer.Worker.csproj` — проект .NET 8 Worker.
- `config.worker.json.example` — пример конфигурации.
- Локальное состояние хранится в SQLite: `.indexer-state.db`.
- Локальный HTTP preview-gateway встроен в тот же `WindowsIndexer.Worker.exe`.

## Быстрый старт
1. Установите .NET SDK 8.
2. Скопируйте конфиг:
   - `copy config.worker.json.example config.worker.json`
3. Отредактируйте `config.worker.json`.
4. Запустите:
   - `dotnet run --project ./WindowsIndexer.Worker.csproj -- ./config.worker.json`

## Публикация в один exe (Windows)
```bash
dotnet publish ./WindowsIndexer.Worker.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```
Готовый exe будет в `bin/Release/net8.0/win-x64/publish/`.

## Конфигурация preview-gateway
- `enablePreviewGateway` — включает встроенный HTTP endpoint для превью.
- `previewGatewayPrefix` — префикс `HttpListener`, по умолчанию `http://localhost:5001/`.
  - Для внешнего доступа можно указать `http://+:5001/`, но в этом случае нужен URL ACL (`netsh http add urlacl ...`).
  - Если wildcard-префикс не удалось открыть из-за прав, worker автоматически попробует fallback на `localhost`.
- `previewAllowedRoots` — список корневых папок, из которых можно читать документы.
- `previewAllowedOrigin` — CORS origin для браузера (`https://sls-planning.omnic.pro`).
- `previewApiKey` — optional ключ (header `X-Preview-Key` или query `key`).

Пример URL в web-превью:
```text
http://192.168.1.193:5001/pdf?path=%5C%5C192.168.1.193%5CPilotGroup%5C_Series_OrderS%5CIndoor%5CAramex%20Drop%20Off%20Mall%5CAraDF.000.000.pdf&key=<preview_key>
```

## Поведение
- Сканирует `scanRoot` рекурсивно.
- Строит snapshot hash по тем же полям (`RelativePath|SizeBytes|Extension|LastWriteTimeUtc`).
- При старте очищает серверную БД индекса (`/api/file-index/clear`), чтобы исключить смешивание данных с разных ПК.
- При изменениях пытается отправить delta, при ошибках `400/404/409` делает fallback на full sync.
- При full sync автоматически режет payload на чанки под `maxPayloadBytes`.
- Логирует входящие preview-запросы и обязательно пишет полученный/разрешённый путь к файлу.
