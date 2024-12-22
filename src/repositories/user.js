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
        `SELECT c.number
         FROM tournament t
                  JOIN User c ON t.id = c.tournament_id
         WHERE t.available = 1
           AND c.available = 1`
    );
  }

  getAll() {
    return this.db.all(
        `SELECT *
         FROM user`
    );
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
    )
  }
}

module.exports = User;