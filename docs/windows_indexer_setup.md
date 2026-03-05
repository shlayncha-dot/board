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
   - `maxFilesPerChunk`: сколько файлов отправлять в одном запросе (по умолчанию `1000`).
   - `auth` (опционально): basic-auth для сервера.

## Запуск вручную
1. Откройте `cmd` от имени пользователя, под которым должен работать процесс.
2. Выполните:
   - `run-indexer.bat`

Если запускаете из **PowerShell**, используйте:
- `./run-indexer.bat` (или `\.\run-indexer.bat` в Windows-нотации)

> В PowerShell команда из текущей папки без префикса `./` не выполняется по умолчанию.

Пример корректного `config.json`:

```json
{
  "serverUrl": "https://sls-planning.omnic.pro",
  "syncEndpoint": "/api/file-index/sync",
  "scanRoot": ".",
  "scanIntervalSeconds": 30,
  "machineId": "Laser-Serv",
  "maxFilesPerChunk": 1000,
  "auth": {
    "type": "basic",
    "username": "sd",
    "password": "sd"
  }
}
```

`serverUrl` должен быть **строкой**, а не вложенным объектом.

## Частая ошибка: `(413) Request Entity Too Large`
- Это не проблема формата JSON: код `413` означает, что сервер/прокси отклонил слишком большой `POST`-запрос.
- Теперь индексатор отправляет снимок по частям (`chunk`), а если снова получает `413`, автоматически уменьшает размер пачки и повторяет отправку.
- Если ошибка всё же остается:
  - уменьшите `maxFilesPerChunk` (например, `200`);
  - сузьте `scanRoot` до рабочей директории, а не всего диска;
  - проверьте лимит тела запроса в reverse-proxy (Nginx/IIS/Cloudflare) для `/api/file-index/sync`.

## Автозапуск (всегда работать)
1. Откройте `cmd` от администратора.
2. Выполните:
   - `install-autostart-task.bat`
3. Скрипт создаст задачу `SLS_FileIndexer`, которая стартует при запуске Windows.

## Компиляция
Для батника и PowerShell-скрипта компиляция **не требуется**. Достаточно скопировать файлы и запустить `.bat`.
