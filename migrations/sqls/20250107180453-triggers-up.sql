CREATE TRIGGER calculate_rating_lost_by_1
    AFTER UPDATE
    ON match
    WHEN new.finished = 1 AND old.finished != 1 AND (SELECT count(lost_1_by)
                                                     FROM game g
                                                     WHERE new.id = g.match_id
                                                     GROUP BY g.match_id) = (SELECT cast(value AS int)
                                                                             FROM settings
                                                                             WHERE name = 'wins')
BEGIN
    INSERT INTO rating (user_id, match_id, previous, delta)
    VALUES (new.user_1_id,
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM match m
                            JOIN user u ON u.id = m.user_1_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE m.id = new.id
                   GROUP BY u.id)),
            (SELECT CASE WHEN (rating_win - rating_lose) >= 100 THEN 0 ELSE round(((100 - rating_win + rating_lose) / (-10)), 1) END
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM match m1
                                  JOIN user u1 ON u1.id IN (m1.user_3_id, m1.user_4_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE m1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM match m2
                                  JOIN user u2 ON u2.id IN (m2.user_1_id, m2.user_2_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE m2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           (new.user_2_id,
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM match m
                            JOIN user u ON u.id = m.user_2_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE m.id = new.id
                   GROUP BY u.id)),
            (SELECT CASE WHEN (rating_win - rating_lose) >= 100 THEN 0 ELSE round(((100 - rating_win + rating_lose) / (-10)), 1) END
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM match m1
                                  JOIN user u1 ON u1.id IN (m1.user_3_id, m1.user_4_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE m1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM match m2
                                  JOIN user u2 ON u2.id IN (m2.user_1_id, m2.user_2_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE m2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           (new.user_3_id,
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM match m
                            JOIN user u ON u.id = m.user_3_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE m.id = new.id
                   GROUP BY u.id)),
            (SELECT CASE WHEN (rating_win - rating_lose) >= 100 THEN 0 ELSE round(((100 - rating_win + rating_lose) / 10), 1) END
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM match m1
                                  JOIN user u1 ON u1.id IN (m1.user_3_id, m1.user_4_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE m1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM match m2
                                  JOIN user u2 ON u2.id IN (m2.user_1_id, m2.user_2_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE m2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           (new.user_4_id,
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM match m
                            JOIN user u ON u.id = m.user_4_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE m.id = new.id
                   GROUP BY u.id)),
            (SELECT CASE WHEN (rating_win - rating_lose) >= 100 THEN 0 ELSE round(((100 - rating_win + rating_lose) / 10), 1) END
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM match m1
                                  JOIN user u1 ON u1.id IN (m1.user_3_id, m1.user_4_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE m1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM match m2
                                  JOIN user u2 ON u2.id IN (m2.user_1_id, m2.user_2_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE m2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1));
END;

CREATE TRIGGER calculate_rating_lost_by_2
    AFTER UPDATE
    ON match
    WHEN new.finished = 1 AND old.finished != 1 AND (SELECT count(lost_2_by)
                                                     FROM game g
                                                     WHERE new.id = g.match_id
                                                     GROUP BY g.match_id) = (SELECT cast(value AS int)
                                                                             FROM settings
                                                                             WHERE name = 'wins')
BEGIN
    INSERT INTO rating (user_id, match_id, previous, delta)
    VALUES (new.user_1_id,
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM match m
                            JOIN user u ON u.id = m.user_1_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE m.id = new.id
                   GROUP BY u.id)),
            (SELECT CASE WHEN (rating_win - rating_lose) >= 100 THEN 0 ELSE round(((100 - rating_win + rating_lose) / 10), 1) END
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM match m1
                                  JOIN user u1 ON u1.id IN (m1.user_1_id, m1.user_2_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE m1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM match m2
                                  JOIN user u2 ON u2.id IN (m2.user_3_id, m2.user_4_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE m2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           (new.user_2_id,
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM match m
                            JOIN user u ON u.id = m.user_2_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE m.id = new.id
                   GROUP BY u.id)),
            (SELECT CASE WHEN (rating_win - rating_lose) >= 100 THEN 0 ELSE round(((100 - rating_win + rating_lose) / 10), 1) END
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM match m1
                                  JOIN user u1 ON u1.id IN (m1.user_1_id, m1.user_2_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE m1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM match m2
                                  JOIN user u2 ON u2.id IN (m2.user_3_id, m2.user_4_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE m2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           (new.user_3_id,
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM match m
                            JOIN user u ON u.id = m.user_3_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE m.id = new.id
                   GROUP BY u.id)),
            (SELECT CASE WHEN (rating_win - rating_lose) >= 100 THEN 0 ELSE round(((100 - rating_win + rating_lose) / (-10)), 1) END
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM match m1
                                  JOIN user u1 ON u1.id IN (m1.user_1_id, m1.user_2_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE m1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM match m2
                                  JOIN user u2 ON u2.id IN (m2.user_3_id, m2.user_4_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE m2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           (new.user_4_id,
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM match m
                            JOIN user u ON u.id = m.user_4_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE m.id = new.id
                   GROUP BY u.id)),
            (SELECT CASE WHEN (rating_win - rating_lose) >= 100 THEN 0 ELSE round(((100 - rating_win + rating_lose) / (-10)), 1) END
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM match m1
                                  JOIN user u1 ON u1.id IN (m1.user_1_id, m1.user_2_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE m1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM match m2
                                  JOIN user u2 ON u2.id IN (m2.user_3_id, m2.user_4_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE m2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1));
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
    WHERE user_id IN (SELECT user_1_id FROM match WHERE id = new.match_id)
       OR user_id IN (SELECT user_2_id FROM match WHERE id = new.match_id)
       OR user_id IN (SELECT user_3_id FROM match WHERE id = new.match_id)
       OR user_id IN (SELECT user_4_id FROM match WHERE id = new.match_id);
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
