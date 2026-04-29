const Repository = require('./common');
const crypto = require('crypto');
const Promise = require("bluebird");

class User {
  constructor() {
    if (User._instance) {
      return User._instance;
    }
    User._instance = this;

    this.db = new Repository().db;
  }

  getArchived() {
    return this.db.all('SELECT * FROM archived');
  }

  getAll() {
    return this.db.all('SELECT * FROM players');
  }

  select(city_id) {
    return this.db.all(`SELECT u.id, u.lastname || ' ' || u.firstname AS text
                        FROM user u
                                 LEFT JOIN team_user tu ON u.id = tu.user_id
                                 LEFT JOIN team t ON tu.team_id = t.id
                                 LEFT JOIN tournament tt ON t.tournament_id = tt.id AND tt.current = 1
                                 LEFT JOIN tournament_user ttu ON tt.id = ttu.tournament_id AND ttu.archived = 0
                        WHERE u.city_id = ?
                          AND tu.user_id IS NULL`,
        [city_id]
    );
  }

  getById(id) {
    return this.db.get(
        `SELECT u.id,
                u.lastname,
                u.firstname,
                u.patronymic,
                u.birthday,
                cast(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', u.birthday) AS INT) AS age,
                u.sex,
                coalesce(up.pic, ul.img)                                                  AS pic,
                u.city_id,
                ul.rating_1,
                ul.rating_2,
                ul.site_login,
                ul.site_id,
                ul.club
         FROM user u
                  LEFT OUTER JOIN user_pic up ON u.id = up.user_id
                  LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
         WHERE u.id = ?`,
        [id]
    );
  }

  getCoWinnersById(id) {
    return this.db.all(`
                SELECT user_id, count(match_id) AS win_count
                FROM (SELECT m.id AS match_id, CASE WHEN m.user_1_id = $user_id THEN m.user_2_id ELSE m.user_1_id END AS user_id
                      FROM user u
                               JOIN match m ON u.id IN (m.user_1_id, m.user_2_id)
                               JOIN game g ON m.id = g.match_id
                      WHERE u.id = $user_id
                      GROUP BY m.id
                      HAVING count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      UNION ALL
                      SELECT m.id AS match_id, CASE WHEN m.user_3_id = $user_id THEN m.user_4_id ELSE m.user_3_id END AS user_id
                      FROM user u
                               JOIN match m ON u.id IN (m.user_3_id, m.user_4_id)
                               JOIN game g ON m.id = g.match_id
                      WHERE u.id = $user_id
                      GROUP BY m.id
                      HAVING count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins'))
                GROUP BY user_id
                ORDER BY win_count DESC`,
        {
          $user_id: id,
        }
    ).then(winners => winners.map(w => this.getById(w.user_id).then(u => {
      return {user_id: w.user_id, win_count: w.win_count, user_name: `${u.lastname} ${u.firstname}`, user_sex: u.sex, user_pic: u.pic}
    }))).then(responses => Promise.all(responses));
  }

  getCoLosersById(id) {
    return this.db.all(`
                SELECT user_id, count(match_id) AS lose_count
                FROM (SELECT m.id AS match_id, CASE WHEN m.user_1_id = $user_id THEN m.user_2_id ELSE m.user_1_id END AS user_id
                      FROM user u
                               JOIN match m ON u.id IN (m.user_1_id, m.user_2_id)
                               JOIN game g ON m.id = g.match_id
                      WHERE u.id = $user_id
                      GROUP BY m.id
                      HAVING count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      UNION ALL
                      SELECT m.id AS match_id, CASE WHEN m.user_3_id = $user_id THEN m.user_4_id ELSE m.user_3_id END AS user_id
                      FROM user u
                               JOIN match m ON u.id IN (m.user_3_id, m.user_4_id)
                               JOIN game g ON m.id = g.match_id
                      WHERE u.id = $user_id
                      GROUP BY m.id
                      HAVING count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins'))
                GROUP BY user_id
                ORDER BY lose_count DESC`,
        {
          $user_id: id,
        }
    ).then(losers => losers.map(l => this.getById(l.user_id).then(u => {
      return {user_id: l.user_id, lose_count: l.lose_count, user_name: `${u.lastname} ${u.firstname}`, user_sex: u.sex, user_pic: u.pic}
    }))).then(responses => Promise.all(responses));
  }

  create(lastname, firstname, patronymic, sex, city_id, birthday) {
    return this.db.run(
        `INSERT INTO user (lastname, firstname, patronymic, sex, city_id, birthday)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [lastname, firstname, patronymic, sex, city_id, birthday]
    );
  }

  registerAll() {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available)
         SELECT (SELECT t.id FROM tournament t WHERE t.current = 1), u.id, 1
         FROM user u
         WHERE true
         ON CONFLICT DO NOTHING`
    );
  }

  registerByIds(ids) {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         SELECT (SELECT t.id FROM tournament t WHERE t.current = 1), u.id, 1, 0
         FROM user u
         WHERE u.id IN (SELECT value FROM json_each(?))
         ON CONFLICT DO UPDATE SET available = 1,
                                   archived  = 0`,
        [JSON.stringify(ids)]
    );
  }

  deregisterAll() {
    return this.db.run(
        `DELETE
         FROM tournament_user
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)`
    );
  }

  deregisterByIds(ids) {
    return this.db.run(
        `DELETE
         FROM tournament_user
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND user_id IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(ids)]
    );
  }

  actualize() {
    return this.archiveAll()
    .then(() => {
      return this.db.run(
          `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
           SELECT (SELECT id FROM tournament WHERE current = 1), user_id, 1, 0
           FROM delta_month
           WHERE true
           ON CONFLICT DO UPDATE SET available = 1,
                                     archived  = 0`
      )
    });
  }

  archive(id) {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         VALUES ((SELECT id FROM tournament WHERE current = 1), ?, 0, 1)
         ON CONFLICT DO UPDATE SET archived  = 1,
                                   available = 0`,
        [id]
    );
  }

  archiveAll() {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         SELECT (SELECT id FROM tournament WHERE current = 1), id, 0, 1
         FROM players
         WHERE true
         ON CONFLICT DO UPDATE SET available = 0,
                                   archived  = 1`
    );
  }

  unarchive(id) {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         VALUES ((SELECT id FROM tournament WHERE current = 1), ?, 1, 0)
         ON CONFLICT DO UPDATE SET available = 1,
                                   archived  = 0`,
        [id]
    );
  }

  unarchiveAll() {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         SELECT (SELECT id FROM tournament WHERE current = 1), id, 0, 1
         FROM players
         WHERE true
         ON CONFLICT DO UPDATE SET available = 1,
                                   archived  = 0`
    );
  }

  setPassword(id, password) {
    const salt = crypto.randomBytes(16);
    const hashed_password = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');
    return this.db.run(
        `UPDATE user
         SET hashed_password = ?,
             salt            = ?
         WHERE id = ?`,
        [hashed_password, salt, id]
    );
  }

  getRating(id) {
    return this.db.get(
        `SELECT round((coalesce(r.previous, 0) + coalesce(r.delta, 0)), 1) AS rating
         FROM (SELECT MAX(id) AS id, user_id, previous, delta FROM rating GROUP BY user_id) r
         WHERE user_id = ?`,
        [id]
    );
  }

  setRating(id, rating) {
    return this.db.run(
        `INSERT INTO rating (user_id, previous)
         VALUES (?, ?)`,
        [id, rating]
    );
  }

  setLabInfo(user_id, site_id, site_login, site_name, rating_1, rating_2, img, city, club, year) {
    return this.db.run(
        `INSERT INTO user_lab (user_id, site_id, site_login, site_name, rating_1, rating_2, img, city, club, year)
         VALUES ($user_id, $site_id, $site_login, $site_name, $rating_1, $rating_2, $img, $city, $club, $year)
         ON CONFLICT DO UPDATE SET site_id    = $site_id,
                                   site_login = $site_login,
                                   site_name  = $site_name,
                                   rating_1   = $rating_1,
                                   rating_2   = $rating_2,
                                   img        = $img,
                                   city       = $city,
                                   club       = $club,
                                   year       = $year
         WHERE user_id = $user_id`,
        {
          $user_id: user_id,
          $site_id: site_id,
          $site_login: site_login,
          $site_name: site_name,
          $rating_1: rating_1,
          $rating_2: rating_2,
          $img: img,
          $city: city,
          $club: club,
          $year: year
        }
    );
  }

  getDaysUntilBirthday(id) {
    return this.db.get(
        `SELECT CAST(CASE
                         WHEN strftime('%m-%d', birthday) >= strftime('%m-%d', 'now')
                             THEN julianday(strftime('%Y', 'now') || '-' || strftime('%m-%d', birthday)) - julianday('now')
                         ELSE julianday((strftime('%Y', 'now') + 1) || '-' || strftime('%m-%d', birthday)) - julianday('now') END AS int) AS days
         FROM user
         WHERE id = ?
         ORDER BY days`,
        [id]
    );
  }

  getMatchesCount(id) {
    return this.db.get(
        `SELECT count() AS count
         FROM user u
                  JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
         WHERE u.id = ?`,
        [id]
    );
  }

  getGamesCount(id) {
    return this.db.get(
        `SELECT count() AS count
         FROM user u
                  JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
                  JOIN game g on m.id = g.match_id
         WHERE u.id = ?`,
        [id]
    );
  }
}

module.exports = User;
