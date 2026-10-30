-- Нормализация тестового фикстура поверх дампа 05-specific.
-- Дамп перегенерируется из живой базы, где состояние уходит вперёд
-- (новые турниры, клубы, спортзалы — сейчас «Шаг вперёд»), а весь набор
-- тестов построен вокруг фиксированного фисктура: текущий турнир 4
-- ('Новая Лига') с кортами 11–13, клубы 1–3, спортзалы 1–3.
-- Применяется после миграций мастера (src/bin/run-tests.ts) и в clean()
-- (tests/helpers/migration.ts), т.к. clean() заново накатывает дамп.

-- «Шаг вперёд» и его данные не входят в тестовый фикстур. Порядок — от
-- зависимых таблиц к турниру: живой дамп непредсказуемо обрастает данными
-- текущего турнира (настройки, матчи, игры, команды), чистим всё каскадом.
DELETE FROM rating WHERE match_id IN (SELECT id FROM match WHERE tournament_id > 4);
DELETE FROM game WHERE match_id IN (SELECT id FROM match WHERE tournament_id > 4);
DELETE FROM match WHERE tournament_id > 4;
DELETE FROM game_110 WHERE match_110_id IN (SELECT id FROM match_110 WHERE tournament_id > 4);
DELETE FROM team_order_110 WHERE team_id IN (SELECT id FROM team WHERE tournament_id > 4);
DELETE FROM team_user WHERE team_id IN (SELECT id FROM team WHERE tournament_id > 4);
DELETE FROM team WHERE tournament_id > 4;
DELETE FROM match_110 WHERE tournament_id > 4;
DELETE FROM tournament_settings WHERE tournament_id > 4;
DELETE FROM tournament_user WHERE tournament_id > 4;
DELETE FROM court WHERE tournament_id > 4;
DELETE FROM tournament WHERE id > 4;
DELETE FROM user_club_gym WHERE user_club_id > 3;
DELETE FROM gym WHERE id > 3;
DELETE FROM user_club WHERE id > 3;

-- текущим остаётся тестовый турнир 4
UPDATE tournament SET current = CASE WHEN id = 4 THEN 1 ELSE 0 END;
