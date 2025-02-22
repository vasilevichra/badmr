CREATE TRIGGER calculate_rating_lost_1
    AFTER INSERT
    ON game
    WHEN new.lost_1_by IS NOT NULL
BEGIN
    INSERT INTO rating (user_id, game_id, previous, delta)
    VALUES ((SELECT u.id
             FROM game g
                      JOIN match m ON m.id = g.match_id
                      JOIN user u ON u.id = m.user_1_id
             WHERE g.id = new.id
             LIMIT 1),
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM game g
                            JOIN match m ON m.id = g.match_id
                            JOIN user u ON u.id = m.user_1_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE g.id = new.id
                   GROUP BY u.id)),
            (SELECT round(((100 - rating_win + rating_lose) / (-10)), 1)
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM game g1
                                  JOIN match m1 ON m1.id = g1.match_id
                                  JOIN user u1 ON u1.id IN (m1.user_3_id, m1.user_4_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE g1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM game g2
                                  JOIN match m2 ON m2.id = g2.match_id
                                  JOIN user u2 ON u2.id IN (m2.user_1_id, m2.user_2_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE g2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           ((SELECT u.id
             FROM game g
                      JOIN match m ON m.id = g.match_id
                      JOIN user u ON u.id = m.user_2_id
             WHERE g.id = new.id
             LIMIT 1),
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM game g
                            JOIN match m ON m.id = g.match_id
                            JOIN user u ON u.id = m.user_2_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE g.id = new.id
                   GROUP BY u.id)),
            (SELECT round(((100 - rating_win + rating_lose) / (-10)), 1)
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM game g1
                                  JOIN match m1 ON m1.id = g1.match_id
                                  JOIN user u1 ON u1.id IN (m1.user_3_id, m1.user_4_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE g1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM game g2
                                  JOIN match m2 ON m2.id = g2.match_id
                                  JOIN user u2 ON u2.id IN (m2.user_1_id, m2.user_2_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE g2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           ((SELECT u.id
             FROM game g
                      JOIN match m ON m.id = g.match_id
                      JOIN user u ON u.id = m.user_3_id
             WHERE g.id = new.id
             LIMIT 1),
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM game g
                            JOIN match m ON m.id = g.match_id
                            JOIN user u ON u.id = m.user_3_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE g.id = new.id
                   GROUP BY u.id)),
            (SELECT round(((100 - rating_win + rating_lose) / 10), 1)
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM game g1
                                  JOIN match m1 ON m1.id = g1.match_id
                                  JOIN user u1 ON u1.id IN (m1.user_3_id, m1.user_4_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE g1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM game g2
                                  JOIN match m2 ON m2.id = g2.match_id
                                  JOIN user u2 ON u2.id IN (m2.user_1_id, m2.user_2_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE g2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           ((SELECT u.id
             FROM game g
                      JOIN match m ON m.id = g.match_id
                      JOIN user u ON u.id = m.user_4_id
             WHERE g.id = new.id
             LIMIT 1),
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM game g
                            JOIN match m ON m.id = g.match_id
                            JOIN user u ON u.id = m.user_4_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE g.id = new.id
                   GROUP BY u.id)),
            (SELECT round(((100 - rating_win + rating_lose) / 10), 1)
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM game g1
                                  JOIN match m1 ON m1.id = g1.match_id
                                  JOIN user u1 ON u1.id IN (m1.user_3_id, m1.user_4_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE g1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM game g2
                                  JOIN match m2 ON m2.id = g2.match_id
                                  JOIN user u2 ON u2.id IN (m2.user_1_id, m2.user_2_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE g2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1));
END;

CREATE TRIGGER calculate_rating_lost_2
    AFTER INSERT
    ON game
    WHEN new.lost_2_by IS NOT NULL
BEGIN
    INSERT INTO rating (user_id, game_id, previous, delta)
    VALUES ((SELECT u.id
             FROM game g
                      JOIN match m ON m.id = g.match_id
                      JOIN user u ON u.id = m.user_1_id
             WHERE g.id = new.id
             LIMIT 1),
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM game g
                            JOIN match m ON m.id = g.match_id
                            JOIN user u ON u.id = m.user_1_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE g.id = new.id
                   GROUP BY u.id)),
            (SELECT round(((100 - rating_win + rating_lose) / 10), 1)
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM game g1
                                  JOIN match m1 ON m1.id = g1.match_id
                                  JOIN user u1 ON u1.id IN (m1.user_1_id, m1.user_2_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE g1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM game g2
                                  JOIN match m2 ON m2.id = g2.match_id
                                  JOIN user u2 ON u2.id IN (m2.user_3_id, m2.user_4_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE g2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           ((SELECT u.id
             FROM game g
                      JOIN match m ON m.id = g.match_id
                      JOIN user u ON u.id = m.user_2_id
             WHERE g.id = new.id
             LIMIT 1),
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM game g
                            JOIN match m ON m.id = g.match_id
                            JOIN user u ON u.id = m.user_2_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE g.id = new.id
                   GROUP BY u.id)),
            (SELECT round(((100 - rating_win + rating_lose) / 10), 1)
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM game g1
                                  JOIN match m1 ON m1.id = g1.match_id
                                  JOIN user u1 ON u1.id IN (m1.user_1_id, m1.user_2_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE g1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM game g2
                                  JOIN match m2 ON m2.id = g2.match_id
                                  JOIN user u2 ON u2.id IN (m2.user_3_id, m2.user_4_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE g2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           ((SELECT u.id
             FROM game g
                      JOIN match m ON m.id = g.match_id
                      JOIN user u ON u.id = m.user_3_id
             WHERE g.id = new.id
             LIMIT 1),
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM game g
                            JOIN match m ON m.id = g.match_id
                            JOIN user u ON u.id = m.user_3_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE g.id = new.id
                   GROUP BY u.id)),
            (SELECT round(((100 - rating_win + rating_lose) / (-10)), 1)
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM game g1
                                  JOIN match m1 ON m1.id = g1.match_id
                                  JOIN user u1 ON u1.id IN (m1.user_1_id, m1.user_2_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE g1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM game g2
                                  JOIN match m2 ON m2.id = g2.match_id
                                  JOIN user u2 ON u2.id IN (m2.user_3_id, m2.user_4_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE g2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1)),
           ((SELECT u.id
             FROM game g
                      JOIN match m ON m.id = g.match_id
                      JOIN user u ON u.id = m.user_4_id
             WHERE g.id = new.id
             LIMIT 1),
            new.id,
            (SELECT round((p + coalesce(d, 0)), 1)
             FROM (SELECT r.previous AS p, r.delta AS d, max(r.id)
                   FROM game g
                            JOIN match m ON m.id = g.match_id
                            JOIN user u ON u.id = m.user_4_id
                            JOIN rating r ON u.id = r.user_id
                   WHERE g.id = new.id
                   GROUP BY u.id)),
            (SELECT round(((100 - rating_win + rating_lose) / (-10)), 1)
             FROM (SELECT (sum(rate1) / 2.0) AS rating_win
                   FROM (SELECT (r1.previous + coalesce(r1.delta, 0)) AS rate1, max(r1.id)
                         FROM game g1
                                  JOIN match m1 ON m1.id = g1.match_id
                                  JOIN user u1 ON u1.id IN (m1.user_1_id, m1.user_2_id)
                                  JOIN rating r1 ON r1.user_id = u1.id
                         WHERE g1.id = new.id
                         GROUP BY u1.id)),
                  (SELECT (sum(rate2) / 2.0) AS rating_lose
                   FROM (SELECT (r2.previous + coalesce(r2.delta, 0)) AS rate2, max(r2.id)
                         FROM game g2
                                  JOIN match m2 ON m2.id = g2.match_id
                                  JOIN user u2 ON u2.id IN (m2.user_3_id, m2.user_4_id)
                                  JOIN rating r2 ON r2.user_id = u2.id
                         WHERE g2.id = new.id
                         GROUP BY u2.id))
             LIMIT 1));
END;

CREATE TRIGGER delete_rating_when_game_deleted
    AFTER DELETE
    ON game
BEGIN
    DELETE FROM rating WHERE game_id = old.id;
END;

CREATE TRIGGER enable_resources_when_match_finished
    AFTER INSERT
    ON game
    WHEN ((SELECT count(g.lost_1_by)
           FROM game g
                    JOIN match m ON m.id = g.match_id
           -- todo переписать 2 на:
           -- (SELECT coalesce(s.value, d.value) AS value FROM defaults d
           --  LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id
           --  LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1
           --  WHERE d.name = 'wins')
           WHERE g.match_id = new.match_id) = 2 OR (SELECT count(g.lost_2_by)
                                                    FROM game g
                                                    WHERE g.match_id = new.match_id) = 2)
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
