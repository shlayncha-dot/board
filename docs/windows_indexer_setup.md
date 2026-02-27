# Windows indexer: установка и запуск

## Что входит
- `tools/windows-indexer/indexer.ps1` — основной скрипт индексации.
- `tools/windows-indexer/run-indexer.bat` — запуск скрипта.
- `tools/windows-indexer/install-autostart-task.bat` — добавление автозапуска через Планировщик задач.
- `tools/windows-indexer/config.json.example` — пример конфигурации.

## Настройка
1. Скопируйте папку `tools/windows-indexer` на удаленный Windows-ПК.
2. В этой папке создайте `config.json` на основе `config.json.example`.
3. Заполните параметры:
   - `serverUrl`: адрес сервера (`https://sls-planning.omnic.pro`).
   - `syncEndpoint`: endpoint API (`/api/file-index/sync`).
   - `scanRoot`: папка для сканирования относительно расположения батника, например `.`.
   - `scanIntervalSeconds`: интервал сканирования.
   - `machineId`: уникальный идентификатор ПК.

## Запуск вручную
1. Откройте `cmd` от имени пользователя, под которым должен работать процесс.
2. Выполните:
   - `run-indexer.bat`

## Автозапуск (всегда работать)
1. Откройте `cmd` от администратора.
2. Выполните:
   - `install-autostart-task.bat`
3. Скрипт создаст задачу `SLS_FileIndexer`, которая стартует при запуске Windows.

## Компиляция
Для батника и PowerShell-скрипта компиляция **не требуется**. Достаточно скопировать файлы и запустить `.bat`.
