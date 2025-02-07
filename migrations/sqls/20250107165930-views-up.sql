CREATE VIEW ready AS
SELECT u.lastname || ' ' || u.firstname                           AS name,
       u.id                                                       AS user_id,
       round((coalesce(r.previous, 0) + coalesce(r.delta, 0)), 1) AS rating,
       count(DISTINCT m.id)                                       AS matches
FROM tournament as t
         JOIN tournament_user AS tu ON tu.tournament_id = t.id AND tu.available = 1
         JOIN user AS u ON u.id = tu.user_id
         LEFT JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
         JOIN (SELECT max(id) AS id, user_id, previous, delta FROM rating GROUP BY user_id) AS r
              ON r.user_id = u.id
WHERE t.current = 1
  AND t.available = 1
GROUP BY u.id
ORDER BY matches, rating DESC;

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
       coalesce(tu.available, 0)                                  AS enabled
FROM user u
         JOIN city c on c.id = u.city_id
         LEFT OUTER JOIN tournament_user tu ON u.id = tu.user_id
         LEFT OUTER JOIN tournament t on t.id = tu.tournament_id AND t.current = 1
         LEFT JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
         LEFT OUTER JOIN (SELECT max(id) AS id, user_id, previous, delta
                          FROM rating
                          GROUP BY user_id) AS r ON r.user_id = u.id
         LEFT OUTER JOIN delta_today dt ON dt.user_id = u.id
         LEFT OUTER JOIN delta_week dw ON dw.user_id = u.id
         LEFT OUTER JOIN delta_month dm ON dm.user_id = u.id
         LEFT OUTER JOIN user_pic up ON up.user_id = u.id
GROUP BY u.id;

CREATE VIEW delta_today AS
SELECT u.id AS user_id, u.lastname || ' ' || u.firstname AS name, round(sum(r.delta), 1) AS sum
FROM rating r
         JOIN game g ON g.id = r.game_id AND date(g.created_at) = date('now')
         JOIN user u ON u.id = r.user_id
GROUP BY r.user_id
ORDER BY sum DESC;

CREATE VIEW delta_week AS
SELECT u.id AS user_id, u.lastname || ' ' || u.firstname AS name, round(sum(r.delta), 1) AS sum
FROM rating r
         JOIN game g ON g.id = r.game_id AND
                        date(g.created_at) BETWEEN date('now', 'weekday 0', '-6 day') AND date('now', 'weekday 0')
         JOIN user u ON u.id = r.user_id
GROUP BY r.user_id
ORDER BY sum DESC;

CREATE VIEW delta_month AS
SELECT u.id AS user_id, u.lastname || ' ' || u.firstname AS name, round(sum(r.delta), 1) AS sum
FROM rating r
         JOIN game g ON g.id = r.game_id AND
                        date(g.created_at) BETWEEN date('now', 'start of month') AND date('now', 'start of month', '+1 month', '-1 day')
         JOIN user u ON u.id = r.user_id
GROUP BY r.user_id
ORDER BY sum DESC;