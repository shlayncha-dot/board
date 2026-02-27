# Почему появляется ошибка «Не удается запустить запускаемый проект»

Эта ошибка в Visual Studio возникает, когда **не выбран запускаемый startup-проект**.
В решении есть 2 проекта:
- `sls-planning-1c.client` (`.esproj`, frontend)
- `SLS-Planning-1C.Server` (`.csproj`, backend, запускаемый проект)

Запускать нужно именно `SLS-Planning-1C.Server`.

## Как исправить (Visual Studio)
1. В **Обозревателе решений** нажмите правой кнопкой на `SLS-Planning-1C.Server`.
2. Выберите **Назначить запускаемым проектом** (*Set as Startup Project*).
3. Выберите профиль `https` или `http` в выпадающем списке рядом с кнопкой запуска.
4. Нажмите **F5**.

## Важно
- Для `.bat`/`PowerShell` индексатора компиляция не нужна — это скрипты.
- Для запуска backend нужен установленный **.NET 8 SDK**.
- Если запускаете из терминала, откройте каталог репозитория (где лежит файл `SLS-Planning-1C.slnx`) и выполните:

```bash
dotnet restore SLS-Planning-1C.Server/SLS-Planning-1C.Server.csproj
dotnet run --project SLS-Planning-1C.Server/SLS-Planning-1C.Server.csproj
```

## Частая причина из скриншота
На скриншоте в PowerShell видно, что команда выполнялась не в папке git-репозитория (`fatal: not a git repository`).
Это не мешает запуску VS, но признак, что открыта/выбрана не та папка в терминале.
