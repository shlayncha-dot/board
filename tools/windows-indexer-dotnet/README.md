# Windows indexer (.NET Worker + SQLite)

Новый индексатор совместим с текущим серверным API:
- `POST /api/file-index/sync`
- `POST /api/file-index/sync-delta`

## Что внутри
- `WindowsIndexer.Worker.csproj` — проект .NET 8 Worker.
- `config.worker.json.example` — пример конфигурации.
- Локальное состояние хранится в SQLite: `.indexer-state.db`.

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

## Поведение
- Сканирует `scanRoot` рекурсивно.
- Строит snapshot hash по тем же полям (`RelativePath|SizeBytes|Extension|LastWriteTimeUtc`).
- При изменениях пытается отправить delta, при ошибках `400/404/409` делает fallback на full sync.
- При full sync автоматически режет payload на чанки под `maxPayloadBytes`.
