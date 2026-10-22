-- ready — готовые к подбору игроки текущего турнира; играющие (чьи матчи
-- ещё не завершены) во вьюху не попадают; won — исход последнего матча
-- игрока: 1 - выиграл, 0 - проиграл, null - не играл; wins — выигранные
-- игроком матчи текущего турнира
CREATE VIEW ready AS
SELECT r.name,
       r.user_id,
       r.rating,
       r.matches,
       r.played,
       r.wins,
       -- исход последнего матча: гейм выигран стороной, когда у соперника
       -- установлен lost_*_by; матч выигран стороной с большим числом геймов
       CASE WHEN r.played = 0 THEN NULL ELSE (
           SELECT CASE
                      WHEN (r.user_id IN (lm.user_1_id, lm.user_2_id) AND g.g1 > g.g2)
                          OR (r.user_id IN (lm.user_3_id, lm.user_4_id) AND g.g2 > g.g1)
                          THEN 1
                      ELSE 0 END
           FROM match lm
                    LEFT JOIN (SELECT match_id,
                                      count(CASE WHEN lost_2_by IS NOT NULL THEN 1 END) AS g1,
                                      count(CASE WHEN lost_1_by IS NOT NULL THEN 1 END) AS g2
                               FROM game
                               GROUP BY match_id) g ON g.match_id = lm.id
           WHERE lm.id = (SELECT max(m.id)
                          FROM match m
                          WHERE m.tournament_id = r.tournament_id
                            AND r.user_id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)))
       END AS won
FROM (SELECT u.lastname || ' ' || u.firstname AS name,
             u.id                             AS user_id,
             round((coalesce(r.previous, 0) + coalesce(r.delta, 0)), 1) AS rating,
             count(DISTINCT m.id)             AS matches,
             -- выигранные матчи на турнире: гейм выигран стороной, когда
             -- у соперника установлен lost_*_by; матч выигран стороной
             -- с большим числом геймов (порог — настройка wins)
             count(DISTINCT CASE
                       WHEN (u.id IN (m.user_1_id, m.user_2_id)
                             AND (SELECT count(*) FROM game
                                  WHERE match_id = m.id AND lost_2_by IS NOT NULL)
                                 > (SELECT value - 1 FROM settings WHERE name = 'wins'))
                           OR (u.id IN (m.user_3_id, m.user_4_id)
                               AND (SELECT count(*) FROM game
                                    WHERE match_id = m.id AND lost_1_by IS NOT NULL)
                                   > (SELECT value - 1 FROM settings WHERE name = 'wins'))
                       THEN m.id END) AS wins,
             u.id IN (SELECT DISTINCT u_id
                      FROM (SELECT u_id
                            FROM (SELECT user_1_id AS u_id
                                  FROM match
                                  WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
                                  ORDER BY id DESC
                                  LIMIT (SELECT sum(n) courts
                                         FROM (SELECT count(id) n FROM court WHERE available = 1 AND tournament_id = (SELECT id FROM tournament WHERE current = 1)
                                         UNION SELECT count(id) n FROM match WHERE finished = 0 AND tournament_id = (SELECT id FROM tournament WHERE current = 1))))
                            UNION ALL
                            SELECT u_id
                            FROM (SELECT user_2_id AS u_id
                                  FROM match
                                  WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
                                  ORDER BY id DESC
                                  LIMIT (SELECT sum(n) courts
                                         FROM (SELECT count(id) n FROM court WHERE available = 1 AND tournament_id = (SELECT id FROM tournament WHERE current = 1)
                                         UNION SELECT count(id) n FROM match WHERE finished = 0 AND tournament_id = (SELECT id FROM tournament WHERE current = 1))))
                            UNION ALL
                            SELECT u_id
                            FROM (SELECT user_3_id AS u_id
                                  FROM match
                                  WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
                                  ORDER BY id DESC
                                  LIMIT (SELECT sum(n) courts
                                         FROM (SELECT count(id) n FROM court WHERE available = 1 AND tournament_id = (SELECT id FROM tournament WHERE current = 1)
                                         UNION SELECT count(id) n FROM match WHERE finished = 0 AND tournament_id = (SELECT id FROM tournament WHERE current = 1))))
                            UNION ALL
                            SELECT u_id
                            FROM (SELECT user_4_id AS u_id
                                  FROM match
                                  WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
                                  ORDER BY id DESC
                                  LIMIT (SELECT sum(n) courts
                                         FROM (SELECT count(id) n FROM court WHERE available = 1 AND tournament_id = (SELECT id FROM tournament WHERE current = 1)
                                         UNION SELECT count(id) n FROM match WHERE finished = 0 AND tournament_id = (SELECT id FROM tournament WHERE current = 1)))))) AS played,
             t.id                             AS tournament_id
      FROM tournament as t
               JOIN tournament_user AS tu ON tu.tournament_id = t.id AND tu.available = 1 AND tu.archived != 1
               JOIN user AS u ON u.id = tu.user_id
               LEFT JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id) AND m.tournament_id = t.id
               JOIN (SELECT max(id) AS id, user_id, previous, delta FROM rating GROUP BY user_id) AS r ON r.user_id = u.id
               JOIN defaults d ON d.name = 'matches'
               LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id AND s.tournament_id = t.id
      WHERE t.current = 1
        AND t.available = 1
        -- играющие не попадают в подбор: их текущий матч ещё не завершён
        AND u.id NOT IN (SELECT user_1_id FROM match WHERE tournament_id = t.id AND finished = 0
                         UNION SELECT user_2_id FROM match WHERE tournament_id = t.id AND finished = 0
                         UNION SELECT user_3_id FROM match WHERE tournament_id = t.id AND finished = 0
                         UNION SELECT user_4_id FROM match WHERE tournament_id = t.id AND finished = 0)
      GROUP BY u.id
      HAVING CASE -- сыгранных матчей меньше, чем в ограничении для турнира
                 WHEN s.value > 0 THEN count(DISTINCT m.id) < s.value
                 WHEN d.value > 0 THEN count(DISTINCT m.id) < d.value
                 ELSE 1 END) r
ORDER BY played, matches DESC;

CREATE VIEW players AS
WITH cal AS (
    -- настройки калибровки с приоритетом override'а текущего турнира
    -- (вью settings объявлена ниже по файлу, поэтому merge повторён здесь)
    SELECT CAST(coalesce(
               (SELECT ts.value
                FROM tournament_settings ts
                         JOIN tournament _t ON ts.tournament_id = _t.id AND _t.current = 1
                         JOIN defaults _d ON ts.defaults_id = _d.id AND _d.name = 'calibration_matches'),
               (SELECT value FROM defaults WHERE name = 'calibration_matches')) AS REAL)   AS matches,
           CAST(coalesce(
               (SELECT ts.value
                FROM tournament_settings ts
                         JOIN tournament _t ON ts.tournament_id = _t.id AND _t.current = 1
                         JOIN defaults _d ON ts.defaults_id = _d.id AND _d.name = 'calibration_fresh_days'),
               (SELECT value FROM defaults WHERE name = 'calibration_fresh_days')) AS REAL) AS fresh_days
)
SELECT id,
       name,
       rating,
       rating_lab,
       delta_today,
       delta_week,
       delta_month,
       sex,
       pic,
       matches,
       city,
       birthday,
       enabled,
       paid,
       CASE WHEN (SELECT finished FROM match WHERE id = last_match_id) = 0 THEN 1 ELSE 0 END AS occupied,
       (SELECT _c.number
        FROM match _m
                 JOIN court _c ON _m.court_id = _c.id
        WHERE _m.id = last_match_id)                                                         AS court,
       calibrating,
       calibration_series
FROM (SELECT u.id                                                       AS id,
             u.lastname || ' ' || u.firstname                           AS name,
             round((coalesce(r.previous, 0) + coalesce(r.delta, 0)), 0) AS rating,
             coalesce(ul.rating_2, 0)                                   AS rating_lab,
             dt.sum                                                     AS delta_today,
             dw.sum                                                     AS delta_week,
             dm.sum                                                     AS delta_month,
             u.sex                                                      AS sex,
             coalesce(up.pic, ul.img)                                   AS pic,
             count(DISTINCT m.id)                                       AS matches,
             c.name                                                     AS city,
             u.birthday                                                 AS birthday,
             coalesce(tu.available, 0)                                  AS enabled,
             coalesce(tu.paid, 0)                                       AS paid,
             max(m.id)                                                  AS last_match_id,
             -- игрок под критериями калибровки: рейтинга нет,
             -- он сид (ручная установка без матча), начата серия (stale = 1)
             -- или рейтинг не обновлялся дольше calibration_fresh_days;
             -- во вьюху попадают только игроки текущего турнира (WHERE ниже)
             CASE WHEN cal.matches > 0
                       AND (r.id IS NULL
                            OR r.match_id IS NULL
                            OR r.stale = 1
                            OR julianday('now') - julianday(rm.created_at) > cal.fresh_days)
                  THEN 1 ELSE 0 END                                     AS calibrating,
             -- сыграно матчей в текущей серии калибровки; у сида и протухшего
             -- серия начнётся заново — отображается 0
             CASE WHEN r.stale = 1
                       AND julianday('now') - julianday(rm.created_at) <= cal.fresh_days
                  THEN r.series ELSE 0 END                              AS calibration_series
      FROM user u
               JOIN city c ON c.id = u.city_id
               CROSS JOIN cal
               LEFT OUTER JOIN tournament_user tu ON u.id = tu.user_id AND tu.archived != 1
               LEFT OUTER JOIN tournament t ON t.id = tu.tournament_id AND t.current = 1
               LEFT JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id) AND m.tournament_id = t.id
               LEFT OUTER JOIN (SELECT max(id) AS id, user_id, previous, delta, stale, series, match_id FROM rating GROUP BY user_id) AS r ON r.user_id = u.id
               LEFT OUTER JOIN match rm ON rm.id = r.match_id
               LEFT OUTER JOIN delta_today dt ON dt.user_id = u.id
               LEFT OUTER JOIN delta_week dw ON dw.user_id = u.id
               LEFT OUTER JOIN delta_month dm ON dm.user_id = u.id
               LEFT OUTER JOIN user_pic up ON up.user_id = u.id
               LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
      WHERE t.current = 1
      GROUP BY u.id);

CREATE VIEW archived AS
SELECT u.id AS id, u.lastname || ' ' || u.firstname AS name, u.sex AS sex, coalesce(up.pic, ul.img) AS pic, c.name AS city
FROM user u
         JOIN city c ON c.id = u.city_id
         JOIN tournament_user tu ON u.id = tu.user_id
         JOIN tournament t ON t.id = tu.tournament_id AND t.current = 1
         LEFT OUTER JOIN user_pic up ON up.user_id = u.id
         LEFT OUTER JOIN user_lab ul ON ul.user_id = u.id
WHERE tu.archived = 1;

CREATE VIEW delta_today AS
SELECT u.id AS user_id, u.lastname || ' ' || u.firstname AS name, round(sum(r.delta), 1) AS sum
FROM rating r
         JOIN match m ON m.id = r.match_id AND date(m.created_at) = date('now')
         JOIN user u ON u.id = r.user_id
GROUP BY r.user_id
ORDER BY sum DESC;

CREATE VIEW delta_week AS
SELECT u.id AS user_id, u.lastname || ' ' || u.firstname AS name, round(sum(r.delta), 1) AS sum
FROM rating r
         JOIN match m ON m.id = r.match_id AND date(m.created_at) BETWEEN date('now', 'weekday 0', '-6 day') AND date('now', 'weekday 0')
         JOIN user u ON u.id = r.user_id
GROUP BY r.user_id
ORDER BY sum DESC;

CREATE VIEW delta_month AS
SELECT u.id AS user_id, u.lastname || ' ' || u.firstname AS name, round(sum(r.delta), 1) AS sum
FROM rating r
         JOIN match m ON m.id = r.match_id AND date(m.created_at) BETWEEN date('now', 'start of month') AND date('now', 'start of month', '+1 month', '-1 day')
         JOIN user u ON u.id = r.user_id
GROUP BY r.user_id
ORDER BY sum DESC;

CREATE VIEW settings AS
SELECT distinct d.name, coalesce(s.value, d.value) AS value
FROM defaults d
         LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id
         LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1 AND t.available = 1;