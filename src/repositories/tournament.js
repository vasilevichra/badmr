const Repository = require('./common');

class Tournament {
  constructor() {
    if (Tournament._instance) {
      return Tournament._instance;
    }
    Tournament._instance = this;

    this.db = new Repository().db;
  }

  add(unit_id, name, available) {
    return this.db.run(
        `INSERT INTO tournament (unit_id, name, available)
         VALUES (?, ?, ?)`,
        [unit_id, name, available]
    );
  }

  getCurrent() {
    return this.db.get(
        `SELECT *
         FROM tournament
         WHERE current = 1`
    );
  }

  setCurrent(id) {
    return this.db.run(
        `UPDATE tournament
         SET current = CASE WHEN id = ? THEN 1 ELSE 0 END`,
        [id]
    );
  }

  getAll() {
    return this.db.all(
        `SELECT *
         FROM tournament
         ORDER BY id DESC`
    );
  }

  getById(id) {
    return this.db.get(
        `SELECT *
         FROM tournament
         WHERE id = ?`,
        [id]
    );
  }
}

module.exports = Tournament;