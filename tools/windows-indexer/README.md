# Windows indexer запуск

Если запускаете из **PowerShell**, используйте один из вариантов:

- `./run-indexer.bat`
- `cmd /c run-indexer.bat`

> В PowerShell команда `run-indexer.bat` без `./` (или `.\`) не запускается из текущей папки и дает `CommandNotFoundException`.

## Быстрый старт

1. Скопируйте конфиг:
   - `Copy-Item .\config.json.example .\config.json`
2. Отредактируйте `config.json`.
3. Запустите индексатор:
   - `./run-indexer.bat`

`run-indexer.bat` запускает `indexer.ps1` с `-ExecutionPolicy Bypass` и проверяет наличие `config.json`.

## Настройки для больших каталогов (5000+ файлов)

- `maxPayloadBytes` — максимальный размер HTTP payload.
- `chunkMetadataOverheadBytes` — резерв под поля `ChunkIndex` / `TotalChunks` и JSON-обертку (по умолчанию `512`).

Рекомендуемые значения для старта:

- `maxPayloadBytes`: `600000`..`900000`
- `chunkMetadataOverheadBytes`: `512`..`2048`

Если сервер строго ограничивает размер запроса (например, 1 MB), уменьшайте `maxPayloadBytes`.

## Совместимый упрощённый вариант

Если нужен максимально близкий к «простому» циклическому скрипту вариант, используйте `indexer.compat.ps1`.

Что в нём исправлено относительно типичных черновиков:
- корректная многокусковая отправка (`ChunkIndex` / `TotalChunks`),
- пути и имена файлов отправляются без агрессивной «очистки»,
- сохранена совместимость формата payload с `/api/file-index/sync`.
