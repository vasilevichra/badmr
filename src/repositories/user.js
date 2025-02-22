const Repository = require('./common');

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
        `SELECT *
         FROM user
         WHERE id = ?`,
        [id]
    );
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

  registerById(id) {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available)
         SELECT (SELECT id FROM tournament WHERE current = 1), u.id, 1
         FROM user u
         WHERE u.id = ?
         ON CONFLICT DO NOTHING`,
        [id]
    );
  }

  deregisterAll() {
    return this.db.run(
        `DELETE
         FROM tournament_user
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)`
    );
  }

  deregisterById(id) {
    return this.db.run(
        `DELETE
         FROM tournament_user
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND user_id = ?`,
        [id]
    );
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
         ON CONFLICT DO UPDATE SET available = 1,
                                   archived  = 0`
    );
  }
}

module.exports = User;