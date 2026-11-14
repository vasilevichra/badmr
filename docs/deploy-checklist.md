# Чек-лист деплоя

## Сервер (`npm run release`)

1. `release.sh` удаляет серверную БД (`rm -f /home/r/badmr/.data/badmr.sqlite3`) —
   схема накатывается миграциями с нуля, новых колонок для существующей базы там не бывает.
2. После старта сервиса — smoke: живое табло, счёт сохраняется.

## Упакованное Electron-приложение / локальные базы (BADMR_DATA, dev)

1. При апгрейде базы, где миграции уже применены, `npm run migrate` (запускается
   при старте приложения) исполняет идемпотентный ensure-ALTER — колонки
   `even_1_user_id`, `even_2_user_id`, `serve_user_id`, `game_type_pos`
   таблицы `game_110` добавляются автоматически (см. `src/bin/migrate.ts`).
2. Проверить в выводе миграции: `Ensured: game_110.<колонка>` — появление строк
   означает, что база была старой и получила колонки. На свежей базе строк нет.
3. Ручной ALTER при необходимости (если миграция не запускалась):
   ```sql
   ALTER TABLE game_110 ADD COLUMN even_1_user_id INTEGER NULL;
   ALTER TABLE game_110 ADD COLUMN even_2_user_id INTEGER NULL;
   ALTER TABLE game_110 ADD COLUMN serve_user_id INTEGER NULL;
   ALTER TABLE game_110 ADD COLUMN game_type_pos INTEGER NOT NULL DEFAULT 0;
   ```
   Без этих колонок первое же очко на табло 110 упадёт («no such column: serve_user_id»).
