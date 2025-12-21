CREATE VIEW ready AS
SELECT u.lastname || ' ' || u.firstname                                                                                                                AS name,
       u.id                                                                                                                                            AS user_id,
       round((coalesce(r.previous, 0) + coalesce(r.delta, 0)), 1)                                                                                      AS rating,
       count(DISTINCT m.id)                                                                                                                            AS matches,
       u.id IN (SELECT DISTINCT u_id
                FROM (SELECT u_id
                      FROM (SELECT user_1_id AS u_id
                            FROM match
                            ORDER BY id DESC
                            LIMIT (SELECT sum(n) courts
                                   FROM (SELECT count(id) n FROM court WHERE available = 1 UNION SELECT count(id) n FROM match WHERE finished = 0)))
                      UNION ALL
                      SELECT u_id
                      FROM (SELECT user_2_id AS u_id
                            FROM match
                            ORDER BY id DESC
                            LIMIT (SELECT sum(n) courts
                                   FROM (SELECT count(id) n FROM court WHERE available = 1 UNION SELECT count(id) n FROM match WHERE finished = 0)))
                      UNION ALL
                      SELECT u_id
                      FROM (SELECT user_3_id AS u_id
                            FROM match
                            ORDER BY id DESC
                            LIMIT (SELECT sum(n) courts
                                   FROM (SELECT count(id) n FROM court WHERE available = 1 UNION SELECT count(id) n FROM match WHERE finished = 0)))
                      UNION ALL
                      SELECT u_id
                      FROM (SELECT user_4_id AS u_id
                            FROM match
                            ORDER BY id DESC
                            LIMIT (SELECT sum(n) courts
                                   FROM (SELECT count(id) n FROM court WHERE available = 1 UNION SELECT count(id) n FROM match WHERE finished = 0))))) AS played
FROM tournament as t
         JOIN tournament_user AS tu ON tu.tournament_id = t.id AND tu.available = 1 AND tu.archived = 0
         JOIN user AS u ON u.id = tu.user_id
         LEFT JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
         JOIN (SELECT max(id) AS id, user_id, previous, delta FROM rating GROUP BY user_id) AS r ON r.user_id = u.id
         JOIN defaults d ON d.name = 'matches'
         LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id AND s.tournament_id = t.id
WHERE t.current = 1
  AND t.available = 1
GROUP BY u.id
HAVING CASE -- сыгранных матчей меньше, чем в ограничении для турнира
           WHEN s.value > 0 THEN count(DISTINCT m.id) < s.value
           WHEN d.value > 0 THEN count(DISTINCT m.id) < d.value
           ELSE 1 END
ORDER BY played, matches DESC;

CREATE VIEW players AS
SELECT u.id                                                       AS id,
       u.lastname || ' ' || u.firstname                           AS name,
       round((coalesce(r.previous, 0) + coalesce(r.delta, 0)), 0) AS rating,
       dt.sum                                                     AS delta_today,
       dw.sum                                                     AS delta_week,
       dm.sum                                                     AS delta_month,
       u.sex                                                      AS sex,
       up.pic                                                     AS pic,
       count(DISTINCT m.id)                                       AS matches,
       c.name                                                     AS city,
       u.birthday                                                 AS birthday,
       CASE WHEN tu.id IS NULL THEN 0 ELSE 1 END                  AS registered,
       coalesce(tu.available, 0)                                  AS enabled,
       tu.archived                                                AS archived
FROM user u
         JOIN city c ON c.id = u.city_id
         LEFT OUTER JOIN tournament_user tu ON u.id = tu.user_id
         LEFT OUTER JOIN tournament t ON t.id = tu.tournament_id AND t.current = 1
         LEFT JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
         LEFT OUTER JOIN (SELECT max(id) AS id, user_id, previous, delta FROM rating GROUP BY user_id) AS r ON r.user_id = u.id
         LEFT OUTER JOIN delta_today dt ON dt.user_id = u.id
         LEFT OUTER JOIN delta_week dw ON dw.user_id = u.id
         LEFT OUTER JOIN delta_month dm ON dm.user_id = u.id
         LEFT OUTER JOIN user_pic up ON up.user_id = u.id
WHERE tu.archived IS NULL
   OR tu.archived = 0
GROUP BY u.id;

CREATE VIEW archived AS
SELECT u.id AS id, u.lastname || ' ' || u.firstname AS name, u.sex AS sex, up.pic AS pic, c.name AS city
FROM user u
         JOIN city c ON c.id = u.city_id
         JOIN tournament_user tu ON u.id = tu.user_id
         JOIN tournament t ON t.id = tu.tournament_id AND t.current = 1
         LEFT OUTER JOIN user_pic up ON up.user_id = u.id
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
SELECT d.name, coalesce(s.value, d.value) AS value
FROM defaults d
         LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id
         LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1 AND t.available = 1;