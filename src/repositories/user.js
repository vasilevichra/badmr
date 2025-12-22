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

  getById(id) {
    return this.db.get(
        `SELECT u.id,
                u.lastname,
                u.firstname,
                u.patronymic,
                u.birthday,
                u.sex,
                up.pic,
                u.city_id
         FROM user u
                  LEFT OUTER JOIN user_pic up on u.id = up.user_id
         WHERE u.id = ?`,
        [id]
    );
  }

  add(lastname, firstname, patronymic, sex, city_id, birthday) {
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
        `INSERT INTO tournament_user (tournament_id, user_id, available)
         SELECT (SELECT id FROM tournament WHERE current = 1), u.id, 1
         FROM user u
         WHERE u.id IN (SELECT value FROM json_each(?))
         ON CONFLICT DO NOTHING`,
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
           FROM delta_month WHERE true
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
         FROM players WHERE true
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
         FROM players WHERE true
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
}

module.exports = User;
