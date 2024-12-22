const Repository = require('./common');

class Court {
  constructor() {
    if (Court._instance) {
      return Court._instance;
    }
    Court._instance = this;

    this.db = new Repository().db;
  }

  getById(id) {
    return this.db.get(
        `SELECT *
         FROM court
         WHERE id = ?`,
        [id]
    );
  }

  getAvailable() {
    return this.db.all(
        `SELECT c.number
         FROM tournament t
                  JOIN court c ON t.id = c.tournament_id
         WHERE t.available = 1
           AND c.available = 1`
    );
  }
}

module.exports = Court;