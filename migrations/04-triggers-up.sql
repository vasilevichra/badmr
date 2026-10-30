-- Триггеры турнира. Первоначально рейтинг начисляли два триггера
-- calculate_rating_lost_by_1/2 (по ~113 строк каждый); они слиты в один
-- calculate_rating_when_match_finished: команда-победитель определяется
-- по счёту игр, средние рейтинги команд считаются один раз в CTE,
-- а «предыдущий» рейтинг берётся прямым поиском последней строки
-- пользователя (раньше — джойн match→user→rating с GROUP BY).
-- Guard NOT EXISTS делает начисление идемпотентным: повторная установка
-- finished = 1 не падает с UNIQUE.
--
-- Параметры формулы дельты вынесены в settings: rating_diff_limit (порог
-- разницы средних рейтингов команд, при превышении которого дельта 0) и
-- rating_diff_divisor (делитель чувствительности, delta = (limit - diff)/k).
-- Те же параметры читает фоновый пересчёт рейтинга (src/services/rating.ts).
--
-- Калибровка рейтинга: игроки с неактуальным рейтингом (последняя строка
-- старше calibration_days от даты матча, отсутствует или является
-- сидом — ручной установкой без матча) начинают серию из
-- calibration_matches матчей с повышенным K. Множитель линейно затухает
-- от calibration_boost до 1, дельта ограничена calibration_cap. Состояние
-- серии (stale, series) переносится в строках rating; дата последнего
-- обновления рейтинга берётся из связки с матчем.

CREATE INDEX rating_user_id ON rating (user_id, id);

CREATE TRIGGER calculate_rating_when_match_finished
    AFTER UPDATE
    ON match
    WHEN new.finished = 1
     AND old.finished != 1
     AND NOT EXISTS (SELECT 1 FROM rating WHERE match_id = new.id)
     AND ((SELECT count(lost_1_by)
           FROM game
           WHERE match_id = new.id) = (SELECT cast(value AS int)
                                       FROM settings
                                       WHERE name = 'wins')
       OR (SELECT count(lost_2_by)
           FROM game
           WHERE match_id = new.id) = (SELECT cast(value AS int)
                                       FROM settings
                                       WHERE name = 'wins'))
BEGIN
    INSERT INTO rating (user_id, match_id, previous, delta, stale, series)
    WITH cal AS (
        SELECT (SELECT cast(value AS REAL) FROM settings WHERE name = 'calibration_matches')    AS c,
               (SELECT cast(value AS REAL) FROM settings WHERE name = 'calibration_boost')      AS boost,
               (SELECT cast(value AS REAL) FROM settings WHERE name = 'calibration_cap')        AS cap,
               (SELECT cast(value AS REAL) FROM settings WHERE name = 'calibration_days') AS fresh,
               -- параметры формулы дельты (см. settings rating_diff_limit/divisor);
               -- coalesce — для баз без сидов этих настроек
               coalesce((SELECT cast(value AS REAL) FROM settings WHERE name = 'rating_diff_limit'), 100.0)   AS lim,
               coalesce((SELECT cast(value AS REAL) FROM settings WHERE name = 'rating_diff_divisor'), 10.0)  AS k
    ),
    last AS (
        SELECT (SELECT previous + coalesce(delta, 0)
                FROM rating
                WHERE user_id = new.user_1_id
                ORDER BY id DESC
                LIMIT 1) AS p1,
               (SELECT previous + coalesce(delta, 0)
                FROM rating
                WHERE user_id = new.user_2_id
                ORDER BY id DESC
                LIMIT 1) AS p2,
               (SELECT previous + coalesce(delta, 0)
                FROM rating
                WHERE user_id = new.user_3_id
                ORDER BY id DESC
                LIMIT 1) AS p3,
               (SELECT previous + coalesce(delta, 0)
                FROM rating
                WHERE user_id = new.user_4_id
                ORDER BY id DESC
                LIMIT 1) AS p4,
               -- состояние калибровки последней строки: stale, series и дата
               -- матча, к которому она привязана (у сидов даты нет — NULL)
               (SELECT stale
                FROM rating
                WHERE user_id = new.user_1_id
                ORDER BY id DESC
                LIMIT 1) AS st1,
               (SELECT series
                FROM rating
                WHERE user_id = new.user_1_id
                ORDER BY id DESC
                LIMIT 1) AS se1,
               (SELECT m.created_at
                FROM match m
                WHERE m.id = (SELECT match_id
                              FROM rating
                              WHERE user_id = new.user_1_id
                              ORDER BY id DESC
                              LIMIT 1)) AS d1,
               (SELECT stale
                FROM rating
                WHERE user_id = new.user_2_id
                ORDER BY id DESC
                LIMIT 1) AS st2,
               (SELECT series
                FROM rating
                WHERE user_id = new.user_2_id
                ORDER BY id DESC
                LIMIT 1) AS se2,
               (SELECT m.created_at
                FROM match m
                WHERE m.id = (SELECT match_id
                              FROM rating
                              WHERE user_id = new.user_2_id
                              ORDER BY id DESC
                              LIMIT 1)) AS d2,
               (SELECT stale
                FROM rating
                WHERE user_id = new.user_3_id
                ORDER BY id DESC
                LIMIT 1) AS st3,
               (SELECT series
                FROM rating
                WHERE user_id = new.user_3_id
                ORDER BY id DESC
                LIMIT 1) AS se3,
               (SELECT m.created_at
                FROM match m
                WHERE m.id = (SELECT match_id
                              FROM rating
                              WHERE user_id = new.user_3_id
                              ORDER BY id DESC
                              LIMIT 1)) AS d3,
               (SELECT stale
                FROM rating
                WHERE user_id = new.user_4_id
                ORDER BY id DESC
                LIMIT 1) AS st4,
               (SELECT series
                FROM rating
                WHERE user_id = new.user_4_id
                ORDER BY id DESC
                LIMIT 1) AS se4,
               (SELECT m.created_at
                FROM match m
                WHERE m.id = (SELECT match_id
                              FROM rating
                              WHERE user_id = new.user_4_id
                              ORDER BY id DESC
                              LIMIT 1)) AS d4,
               (SELECT count(lost_1_by)
                FROM game
                WHERE match_id = new.id) AS lost_1,
               (SELECT count(lost_2_by)
                FROM game
                WHERE match_id = new.id) AS lost_2,
               (SELECT cast(value AS int)
                FROM settings
                WHERE name = 'wins') AS wins
    ),
    calc AS (
        SELECT round(p1, 1) AS r1,
               round(p2, 1) AS r2,
               round(p3, 1) AS r3,
               round(p4, 1) AS r4,
               -- дельты для обеих ролей: diff1 = avg(3,4) - avg(1,2) —
               -- на столько команда 3/4 сильнее; при её победе её игроки
               -- получают +(lim - diff1)/k, при проигрыше — наоборот
               CASE WHEN (p3 + p4) / 2.0 - (p1 + p2) / 2.0 >= lim THEN 0
                    ELSE round((lim - ((p3 + p4) / 2.0 - (p1 + p2) / 2.0)) / k, 1) END  AS win34_delta,
               CASE WHEN (p3 + p4) / 2.0 - (p1 + p2) / 2.0 >= lim THEN 0
                    ELSE round((lim - ((p3 + p4) / 2.0 - (p1 + p2) / 2.0)) / -k, 1) END AS lose12_delta,
               CASE WHEN (p1 + p2) / 2.0 - (p3 + p4) / 2.0 >= lim THEN 0
                    ELSE round((lim - ((p1 + p2) / 2.0 - (p3 + p4) / 2.0)) / k, 1) END  AS win12_delta,
               CASE WHEN (p1 + p2) / 2.0 - (p3 + p4) / 2.0 >= lim THEN 0
                    ELSE round((lim - ((p1 + p2) / 2.0 - (p3 + p4) / 2.0)) / -k, 1) END AS lose34_delta,
               lost_1 = wins AS team_1_lost,
               -- калибровка игрока 1: серия начинается, если рейтинга нет,
               -- последняя строка — сид (даты нет) или она протухла
               CASE WHEN st1 IS NULL THEN 1
                    WHEN d1 IS NULL THEN 1
                    WHEN julianday(new.created_at) - julianday(d1) > fresh THEN 1
                    ELSE st1 END                                                        AS stale1,
               CASE WHEN st1 IS NULL OR d1 IS NULL THEN 1
                    WHEN julianday(new.created_at) - julianday(d1) > fresh THEN 1
                    ELSE se1 + 1 END                                                    AS series1,
               CASE WHEN st2 IS NULL THEN 1
                    WHEN d2 IS NULL THEN 1
                    WHEN julianday(new.created_at) - julianday(d2) > fresh THEN 1
                    ELSE st2 END                                                        AS stale2,
               CASE WHEN st2 IS NULL OR d2 IS NULL THEN 1
                    WHEN julianday(new.created_at) - julianday(d2) > fresh THEN 1
                    ELSE se2 + 1 END                                                    AS series2,
               CASE WHEN st3 IS NULL THEN 1
                    WHEN d3 IS NULL THEN 1
                    WHEN julianday(new.created_at) - julianday(d3) > fresh THEN 1
                    ELSE st3 END                                                        AS stale3,
               CASE WHEN st3 IS NULL OR d3 IS NULL THEN 1
                    WHEN julianday(new.created_at) - julianday(d3) > fresh THEN 1
                    ELSE se3 + 1 END                                                    AS series3,
               CASE WHEN st4 IS NULL THEN 1
                    WHEN d4 IS NULL THEN 1
                    WHEN julianday(new.created_at) - julianday(d4) > fresh THEN 1
                    ELSE st4 END                                                        AS stale4,
               CASE WHEN st4 IS NULL OR d4 IS NULL THEN 1
                    WHEN julianday(new.created_at) - julianday(d4) > fresh THEN 1
                    ELSE se4 + 1 END                                                    AS series4,
               c, boost, cap, fresh
        FROM last, cal
    ),
    mult AS (
        SELECT *,
               -- множитель действует, пока серия калибровки не кончилась;
               -- затухание линейное: series=1 → boost, series=c → ~1
               CASE WHEN stale1 = 1 AND series1 <= c AND c > 0
                    THEN 1 + (boost - 1) * (c - series1 + 1) / c ELSE 1 END             AS m1,
               CASE WHEN stale2 = 1 AND series2 <= c AND c > 0
                    THEN 1 + (boost - 1) * (c - series2 + 1) / c ELSE 1 END             AS m2,
               CASE WHEN stale3 = 1 AND series3 <= c AND c > 0
                    THEN 1 + (boost - 1) * (c - series3 + 1) / c ELSE 1 END             AS m3,
               CASE WHEN stale4 = 1 AND series4 <= c AND c > 0
                    THEN 1 + (boost - 1) * (c - series4 + 1) / c ELSE 1 END             AS m4,
               CASE WHEN stale1 = 1 AND series1 <= c AND c > 0 THEN 1 ELSE 0 END        AS ic1,
               CASE WHEN stale2 = 1 AND series2 <= c AND c > 0 THEN 1 ELSE 0 END        AS ic2,
               CASE WHEN stale3 = 1 AND series3 <= c AND c > 0 THEN 1 ELSE 0 END        AS ic3,
               CASE WHEN stale4 = 1 AND series4 <= c AND c > 0 THEN 1 ELSE 0 END        AS ic4
        FROM calc
    )
    SELECT new.user_1_id, new.id, r1,
           round(CASE WHEN ic1 = 1 AND cap > 0
                      THEN min(cap, max(-cap, CASE WHEN team_1_lost THEN lose12_delta ELSE win12_delta END * m1))
                      ELSE CASE WHEN team_1_lost THEN lose12_delta ELSE win12_delta END * m1 END, 1),
           stale1, series1
    FROM mult
    UNION ALL
    SELECT new.user_2_id, new.id, r2,
           round(CASE WHEN ic2 = 1 AND cap > 0
                      THEN min(cap, max(-cap, CASE WHEN team_1_lost THEN lose12_delta ELSE win12_delta END * m2))
                      ELSE CASE WHEN team_1_lost THEN lose12_delta ELSE win12_delta END * m2 END, 1),
           stale2, series2
    FROM mult
    UNION ALL
    SELECT new.user_3_id, new.id, r3,
           round(CASE WHEN ic3 = 1 AND cap > 0
                      THEN min(cap, max(-cap, CASE WHEN team_1_lost THEN win34_delta ELSE lose34_delta END * m3))
                      ELSE CASE WHEN team_1_lost THEN win34_delta ELSE lose34_delta END * m3 END, 1),
           stale3, series3
    FROM mult
    UNION ALL
    SELECT new.user_4_id, new.id, r4,
           round(CASE WHEN ic4 = 1 AND cap > 0
                      THEN min(cap, max(-cap, CASE WHEN team_1_lost THEN win34_delta ELSE lose34_delta END * m4))
                      ELSE CASE WHEN team_1_lost THEN win34_delta ELSE lose34_delta END * m4 END, 1),
           stale4, series4
    FROM mult;
END;

CREATE TRIGGER delete_rating_when_match_deleted
    AFTER DELETE
    ON match
BEGIN
    DELETE FROM rating WHERE match_id = old.id;
END;

CREATE TRIGGER enable_resources_when_match_finished
    AFTER INSERT
    ON game
    WHEN ((SELECT count(g.lost_1_by)
           FROM game g
                    JOIN match m ON m.id = g.match_id
           WHERE g.match_id = new.match_id) = (SELECT cast(value AS int)
                                               FROM settings
                                               WHERE name = 'wins') OR (SELECT count(g.lost_2_by)
                                                                        FROM game g
                                                                        WHERE g.match_id = new.match_id) = (SELECT cast(value AS int)
                                                                                                            FROM settings
                                                                                                            WHERE name = 'wins'))
BEGIN
    UPDATE match SET finished = 1 WHERE id = new.match_id;

    UPDATE court SET available = 1 WHERE id IN (SELECT court_id FROM match WHERE id = new.match_id);

    UPDATE tournament_user
    SET available = 1
    WHERE (user_id IN (SELECT user_1_id FROM match WHERE id = new.match_id)
        OR user_id IN (SELECT user_2_id FROM match WHERE id = new.match_id)
        OR user_id IN (SELECT user_3_id FROM match WHERE id = new.match_id)
        OR user_id IN (SELECT user_4_id FROM match WHERE id = new.match_id))
      AND tournament_id IN (SELECT id FROM tournament AS t WHERE t.available = 1);
END;

CREATE TRIGGER disable_court_and_tournament_users_by_match_created
    AFTER INSERT
    ON match
BEGIN
    UPDATE court SET available = 0 WHERE id = new.court_id;

    UPDATE tournament_user
    SET available = 0
    WHERE user_id IN (new.user_1_id, new.user_2_id, new.user_3_id, new.user_4_id)
      AND tournament_id IN (SELECT id FROM tournament AS t WHERE t.available = 1);
END;

CREATE TRIGGER enable_court_and_tournament_users_by_match_deleted
    AFTER DELETE
    ON match
BEGIN
    UPDATE court SET available = 1 WHERE id = old.court_id;

    UPDATE tournament_user
    SET available = 1
    WHERE user_id IN (old.user_1_id, old.user_2_id, old.user_3_id, old.user_4_id)
      AND tournament_id IN (SELECT id FROM tournament AS t WHERE t.available = 1);
END;
