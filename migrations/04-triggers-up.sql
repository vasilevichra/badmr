-- Триггеры турнира. Первоначально рейтинг начисляли два триггера
-- calculate_rating_lost_by_1/2 (по ~113 строк каждый); они слиты в один
-- calculate_rating_when_match_finished: команда-победитель определяется
-- по счёту игр, средние рейтинги команд считаются один раз в CTE,
-- а «предыдущий» рейтинг берётся прямым поиском последней строки
-- пользователя (раньше — джойн match→user→rating с GROUP BY).
-- Guard NOT EXISTS делает начисление идемпотентным: повторная установка
-- finished = 1 не падает с UNIQUE.

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
    INSERT INTO rating (user_id, match_id, previous, delta)
    WITH last AS (
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
               -- получают +(100 - diff1)/10, при проигрыше — наоборот
               CASE WHEN (p3 + p4) / 2.0 - (p1 + p2) / 2.0 >= 100 THEN 0
                    ELSE round((100 - ((p3 + p4) / 2.0 - (p1 + p2) / 2.0)) / 10.0, 1) END  AS win34_delta,
               CASE WHEN (p3 + p4) / 2.0 - (p1 + p2) / 2.0 >= 100 THEN 0
                    ELSE round((100 - ((p3 + p4) / 2.0 - (p1 + p2) / 2.0)) / -10.0, 1) END AS lose12_delta,
               CASE WHEN (p1 + p2) / 2.0 - (p3 + p4) / 2.0 >= 100 THEN 0
                    ELSE round((100 - ((p1 + p2) / 2.0 - (p3 + p4) / 2.0)) / 10.0, 1) END  AS win12_delta,
               CASE WHEN (p1 + p2) / 2.0 - (p3 + p4) / 2.0 >= 100 THEN 0
                    ELSE round((100 - ((p1 + p2) / 2.0 - (p3 + p4) / 2.0)) / -10.0, 1) END AS lose34_delta,
               lost_1 = wins AS team_1_lost
        FROM last
    )
    SELECT new.user_1_id, new.id, r1, CASE WHEN team_1_lost THEN lose12_delta ELSE win12_delta END
    FROM calc
    UNION ALL
    SELECT new.user_2_id, new.id, r2, CASE WHEN team_1_lost THEN lose12_delta ELSE win12_delta END
    FROM calc
    UNION ALL
    SELECT new.user_3_id, new.id, r3, CASE WHEN team_1_lost THEN win34_delta ELSE lose34_delta END
    FROM calc
    UNION ALL
    SELECT new.user_4_id, new.id, r4, CASE WHEN team_1_lost THEN win34_delta ELSE lose34_delta END
    FROM calc;
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
