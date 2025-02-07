const Repository = require('./common');

class User {
  constructor() {
    if (User._instance) {
      return User._instance;
    }
    User._instance = this;

    this.db = new Repository().db;
  }

  getAvailable() {
    return this.db.all(
        `SELECT u.*
         FROM user u
                  JOIN tournament_user tu ON u.id = tu.user_id
                  JOIN tournament t on t.id = tu.tournament_id AND t.current = 1`
    );
  }

  getAll() {
    return this.db.all(`SELECT * FROM players`);
  }

  getById(id) {
    return this.db.get(
        `SELECT *
         FROM user
         WHERE id = ?`,
        [id]
    );
  }

  create(lastname, firstname, patronomic, sex, city_id, birthday) {
    return this.db.run(
        `INSERT INTO user (lastname, firstname, patronomic, sex, city_id, birthday)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [lastname, firstname, patronomic, sex, city_id, birthday]
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
}

module.exports = User;