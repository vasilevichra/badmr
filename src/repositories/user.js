const Repository = require('./common');
const crypto = require('crypto');

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
                u.sex,
                coalesce(up.pic, ul.img),
                u.city_id
         FROM user u
                  LEFT OUTER JOIN user_pic up ON u.id = up.user_id
                  LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
         WHERE u.id = ?`,
        [id]
    );
  }

  getWinRates() {
    return this.db.all(
        `SELECT *
         FROM (SELECT m.user_1_id AS id1, m.user_2_id AS id2, iif(g.lost_2_by, 1, 0) AS w, iif(g.lost_1_by, 1, 0) AS l
               FROM match m
                        LEFT JOIN game g ON m.id = g.match_id
               UNION ALL
               SELECT m.user_3_id AS id1, m.user_4_id AS id2, iif(g.lost_1_by, 1, 0) AS w, iif(g.lost_2_by, 1, 0) AS l
               FROM match m
                        LEFT JOIN game g ON m.id = g.match_id)`
    ).then(result => {
      const rates = {};
      for (const rate of result) {
        let id1 = rate['id1'];
        let id2 = rate['id2'];
        let w = rate['w'];
        let l = rate['l'];

        if (!rates[id1]) { // новая запись, где первый ключ id1
          const arr = {};
          arr[id2] = {w: w, l: l};
          rates[id1] = arr;
        } else {
          if (!rates[id1][id2]) { // есть id1, но нет id2
            rates[id1][id2] = {w: w, l: l};
          } else { // всё есть - добавляем
            rates[id1][id2]['w'] += w;
            rates[id1][id2]['l'] += l;
          }
        }

        if (!rates[id2]) { // новая запись, где первый ключ id2
          const arr = {};
          arr[id1] = {w: w, l: l};
          rates[id2] = arr;
        } else {
          if (!rates[id2][id1]) { // есть id2, но нет id1
            rates[id2][id1] = {w: w, l: l};
          } else { // всё есть - добавляем
            rates[id2][id1]['w'] += w;
            rates[id2][id1]['l'] += l;
          }
        }
      }
      return rates;
    });
  }

  getWinRateById(id) {
    return this.getWinRates()
    .then(r => r[`${id}`]);
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
}

module.exports = User;
