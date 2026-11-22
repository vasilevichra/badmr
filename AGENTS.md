# AGENTS.md — badmr

Сервер подбора игроков и проведения турниров по бадминтону («Бадминтон и ром»).
Работает локально и как сайт (badmr.ru), и как упакованное Electron-приложение.

## Стек и запуск

- Основные технологии: Node, npm. TypeScript исполняется напрямую через `node --experimental-strip-types` — **сборки нет**; импорты всегда с расширением `.ts`.
- Express 5 + EJS (серверный рендер), passport (локальная авторизация), csurf, express-session на SQLite. БД — `node:sqlite` (`DatabaseSync`), better-sqlite3 нет.
- Фронтенд — серверные EJS-шаблоны + ванильный JS/jQuery/Bootstrap в `src/public/js`, стили в `src/public/css`. Браузерные js/css **не тестируются** и не участвуют в хэше тестового штампа.


## Команды

| Команда | Что делает |
|---|---|
| `npm run test` | Тесты через `src/bin/run-tests.ts` (штамп `.data/test.stamp`: файлы не менялись — пропуск; чтобы прогнать принудительно: `rm -f .data/test.stamp && npm run test`) |
| `npm run typecheck` | `tsc --noEmit`. Внимание: в проекте есть накопленные ошибки типизации (~44, в основном тесты и старые репозитории) — сравнивай с базой, а не требуй нуля |
| `npm run dev` | Пересоздаёт dev-БД (`rm .data/badmr.sqlite3`), миграции, nodemon + открыть localhost:3000 |
| `npm run compile` | Только nodemon с перезапуском (`node --experimental-strip-types src/bin/start.ts`) |
| `npm run migrate` | Накатывает миграции `migrations/*-up.sql` (`src/bin/migrate.ts`, книга `_migrations`) |
| `npm run release` | Тесты → rsync проекта на `box:~/` → `release.sh` на сервере. **Деплоит на прод** |
| `npm run sync:prod` | Синхронизация данных с продом (`src/bin/sync.mjs`) |

## Архитектура

Слои, направление зависимостей строго сверху вниз:

```
app.ts                     express-приложение: сессии, csrf, статика, монтирование роутов
src/routes/                HTTP-роуты API (res.promise(...)); src/routes/web/ — страницные
src/services/              бизнес-логика (pairing — подбор матчей, rating, settings, game)
src/repositories/          SQL-запросы, одна сущность — один файл; классы-синглтоны
src/db.ts                  обёртка над node:sqlite: run/get/all/transaction
migrations/                нумерованные up/down SQL: таблицы → вьюхи → данные → триггеры → сиды → индексы
src/public/views/          EJS-шаблоны (src/public/views/tournament/110 — страницы 110)
src/public/js/             клиентская логика страниц (group.js — матрица и табло 110)
tests/services, tests/routes  тесты слоёв; tests/helpers — сиды
```

Точка входа прод-сервера — `src/bin/start.ts`, Electron — `electron/main.mjs`.

## БД и миграции

- **Все правки SQL вносятся в существующие миграции** (`migrations/*.up.sql`), новые файлы не плодить: прод поднимает схему с нуля, dev-базы обновляются `npm run migrate`.
- Исторически данные могут не удовлетворять FK-ограничения.
- Целостность держат запросы и триггеры.
- Триггеры (`migrations/04-triggers-up.sql`) при `RAISE(ABORT)` превращаются в HTTP 500 `{error}` — клиент обязан обрабатывать (см. `alertError` в `group.js`).
- Синтаксис прод-драйвера: SQLite в node:sqlite.
- При ручных правках схемы через RENAME нужны `PRAGMA legacy_alter_table=ON`, `PRAGMA foreign_keys=OFF`, вьюхи пересоздавать до триггеров.
- Настройки турниров — таблица `tournament_settings` (+ `defaults` с CHECK на имена и диапазоны).
- Добавление настройки: миграция (CHECK, INSERT в defaults) +
  `src/services/settings.ts` (валидация, RELEVANT, ONLY_110) + селект в
  `src/public/js/settings.js` + обновление тестов и README (таблица настроек).

## Тесты

- Собственный раннер `src/bin/run-tests.ts`: тестовая БД собирается из миграций + `migrations/fixture-for-tests.sql`, у воркеров свои копии `.data/test-<pid>.db`.
- Все тесты должны проходить перед коммитом и деплоем.
- Секретные сиды (`src/repositories/specific.ts`, `migrations/05-specific-*`) в CI расшифровываются из `etc/ci-seed.enc` (ключ `CI_SEED_KEY` в GitHub Secrets) — в репозитории лежат в зашифрованном виде.
- CI: GitHub Actions (`.github/workflows/badmr.ci.yml`), `npm ci && npm test`.

## Конвенции кода

- Комментарии и идентификаторы — на русском; комментарий объясняет **инвариант**, а не повторяет код.
- Репозитории — синглтоны через `static _instance`; запросы пишутся как многострочные шаблонные строки, параметры — `?`-плейсхолдеры. - `db.get/all` типизируются дженериком на месте (`db.all<ReadyRow>(...)`); новые методы возвращают типизированные строки — не оставляй касты `as never` / `as unknown as` в новом коде.
- Idempotent-принцип: повторный вызов мутации не ломает состояние (гейты вида «счёт не изменился — ничего не трогаем»).
*   Переменные — camelCase, типы — PascalCase.


## Прод и деплой

- Прод: `https://badmr.ru`.
- `sqlite3` CLI есть только локально; на сервере — `node -e` с `node:sqlite`.
- `release.sh` **удаляет серверную БД** и накатывает миграции с нуля — данные
  прода перед деплоем схемы сохранять/проверять (см. `docs/deploy-checklist.md`).
- Локальные артефакты: `.data/` (dev-БД, тестовые БД, штамп), `prod.sqlite3` (копия прода), `.log/`, резервные копии `*.bak-*` — всё в `.gitignore`, не коммитить.

## Git-правила
* Фичевые ветки называть `feature/<краткое-описание>`, создавать от актуального `origin/master` (`git fetch` перед созданием).
* Перед коммитом выполнить `npm run lint && npm test`.
* Коммиты — с семантическим префиксом (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `perf:`) и упоминанием тикета, если есть.
* Перед пушем фичевой ветки подтягивать актуальный `origin/master` через rebase.
* Не трогать рабочую копию других веток без необходимости; для незакоммиченных изменений — git switch или git stash.
- Если в индексе есть изменения, добавленные через `git add`, и для текущей задачи уже существует коммит — добавляй их в него (`git commit --amend --no-edit`), не создавай отдельный коммит. Если индекс пуст — ничего не коммить.


## Запреты
*   **Не делать:** force push, запуск деплоя без явного разрешения, удаление или переписывание миграций без отдельного согласования.
*   **Не добавлять:** реальные токены, пароли, ключи API в код, фикстуры или `.env`-файлы.

## Обработка ошибок
Перезапускай и жди до получаса если вылетают ошибки:
* `Provider request failed with HTTP 429: {"detail":{"error":"ConcurrencyLimitModel","message":"Model concurrency limit
reached"}}`
* `Connection lost while reading the response: ECONNRESET: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()`
