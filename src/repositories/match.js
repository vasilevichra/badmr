const Repository = require('./common');
const SettingsService = require('../services/settings');
const UserService = require('../services/user');
const Promise = require('bluebird');
const settingsService = new SettingsService();
const userService = new UserService();

class Match {
  constructor() {
    if (Match._instance) {
      return Match._instance;
    }
    Match._instance = this;

    this.db = new Repository().db;
  }

  getAll() {
    return this.db.all(
        `SELECT *
         FROM match m
         WHERE m.tournament_id = (SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)`
    );
  }

  hasUnfinished() {
    return this.db.get(
        `SELECT count(m.id) > 0 AS has
         FROM match m
                  JOIN tournament t on t.id = m.tournament_id
         WHERE t.current = 1
           AND t.available = 1
           AND m.finished = 0`
    );
  }

  getAllUnfinished() {
    return this.db.all(
        `SELECT m.id                                                   AS id,
                m.user_1_id                                            AS user_1_id,
                m.user_2_id                                            AS user_2_id,
                m.user_3_id                                            AS user_3_id,
                m.user_4_id                                            AS user_4_id,
                u1.sex                                                 AS sex1,
                u2.sex                                                 AS sex2,
                u3.sex                                                 AS sex3,
                u4.sex                                                 AS sex4,
                (SELECT pic FROM user_pic WHERE user_id = m.user_1_id) AS pic1,
                (SELECT pic FROM user_pic WHERE user_id = m.user_2_id) AS pic2,
                (SELECT pic FROM user_pic WHERE user_id = m.user_3_id) AS pic3,
                (SELECT pic FROM user_pic WHERE user_id = m.user_4_id) AS pic4,
                u1.lastname || ' ' || u1.firstname                     AS name1,
                u2.lastname || ' ' || u2.firstname                     AS name2,
                u3.lastname || ' ' || u3.firstname                     AS name3,
                u4.lastname || ' ' || u4.firstname                     AS name4,
                c.number                                               AS court
         FROM match m
                  JOIN user u1 on u1.id = m.user_1_id
                  JOIN user u2 on u2.id = m.user_2_id
                  JOIN user u3 on u3.id = m.user_3_id
                  JOIN user u4 on u4.id = m.user_4_id
                  JOIN court c on c.id = m.court_id
         WHERE m.tournament_id = (SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)
           AND m.finished = 0`
    );
  }

  getAllFinishedAtLastSession() {
    return Promise.all([settingsService.get('max_point'), settingsService.get('game_point')])
    .then(([max_point, game_point]) => this.db.all(
        `SELECT m.id                                                                                                                AS match_id,
                m.created_at                                                                                                        AS match_created_at,
                m.user_1_id                                                                                                         AS user_1_id,
                m.user_2_id                                                                                                         AS user_2_id,
                m.user_3_id                                                                                                         AS user_3_id,
                m.user_4_id                                                                                                         AS user_4_id,
                u1.sex                                                                                                              AS sex1,
                u2.sex                                                                                                              AS sex2,
                u3.sex                                                                                                              AS sex3,
                u4.sex                                                                                                              AS sex4,
                u1.lastname || ' ' || u1.firstname                                                                                  AS name1,
                u2.lastname || ' ' || u2.firstname                                                                                  AS name2,
                u3.lastname || ' ' || u3.firstname                                                                                  AS name3,
                u4.lastname || ' ' || u4.firstname                                                                                  AS name4,
                (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_1_id)                                                AS pic1,
                (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_2_id)                                                AS pic2,
                (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_3_id)                                                AS pic3,
                (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_4_id)                                                AS pic4,
                c.number                                                                                                            AS court,
                g.id                                                                                                                AS game_id,
                CASE
                    WHEN g.lost_1_by IS NOT NULL THEN g.lost_1_by
                    WHEN g.lost_2_by < $game_point - 1 THEN $game_point
                    WHEN g.lost_2_by >= $game_point - 1 AND g.lost_2_by < $max_point - 1 THEN g.lost_2_by + 2
                    WHEN g.lost_2_by == $max_point - 1 THEN $max_point END                                                          AS lost_1_by,
                CASE
                    WHEN g.lost_2_by IS NOT NULL THEN g.lost_2_by
                    WHEN g.lost_1_by < $game_point - 1 THEN $game_point
                    WHEN g.lost_1_by >= $game_point - 1 AND g.lost_1_by < $max_point - 1 THEN g.lost_1_by + 2
                    WHEN g.lost_1_by == $max_point - 1 THEN $max_point END                                                          AS lost_2_by,
                g.created_at                                                                                                        AS game_created_at,
                (SELECT sum(coalesce(previous, 0)) / 2 FROM rating WHERE user_id IN (m.user_1_id, m.user_2_id) AND match_id = m.id) AS rating1,
                (SELECT sum(coalesce(previous, 0)) / 2 FROM rating WHERE user_id IN (m.user_3_id, m.user_4_id) AND match_id = m.id) AS rating2,
                (SELECT coalesce(delta, 0) FROM rating WHERE user_id = m.user_1_id AND match_id = m.id)                             AS delta1 -- delta2 вычисляется сменой знака
         FROM match m
                  JOIN user u1 on u1.id = m.user_1_id
                  JOIN user u2 on u2.id = m.user_2_id
                  JOIN user u3 on u3.id = m.user_3_id
                  JOIN user u4 on u4.id = m.user_4_id
                  JOIN court c on c.id = m.court_id
                  JOIN game g on m.id = g.match_id
         WHERE m.tournament_id = (SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)
           AND m.finished = 1
           AND date(m.created_at) = (SELECT date(created_at) AS date FROM match ORDER BY id DESC LIMIT 1)
         ORDER BY date(m.created_at) DESC`,
        {
          $game_point: game_point,
          $max_point: max_point
        }
    ))
    .then(raw => {
      let rawMatches = Object.groupBy(raw, ({match_id}) => match_id);
      let matches = [];
      for (const matchId in rawMatches) {
        matches.push({[matchId]: Object.groupBy(rawMatches[matchId], ({game_id}) => game_id)});
      }
      return matches;
    });
  }

  getById(id) {
    return this.db.get(
        `SELECT *
         FROM match
         WHERE id = ?`,
        [id]
    );
  }

  create(user_1_id, user_2_id, user_3_id, user_4_id) {
    return this.db.run(
        `INSERT INTO match (tournament_id,
                            user_1_id,
                            user_2_id,
                            user_3_id,
                            user_4_id,
                            court_id)
         VALUES ((SELECT id FROM tournament WHERE current = 1),
                 ?,
                 ?,
                 ?,
                 ?,
                 (SELECT id FROM court WHERE available = 1 ORDER BY ROWID ASC LIMIT 1))`,
        [user_1_id, user_2_id, user_3_id, user_4_id]
    );
  }

  deleteById(id) {
    return this.db.run(
        `DELETE
         FROM match
         WHERE id = ?`,
        [id]
    );
  }
}

module.exports = Match;