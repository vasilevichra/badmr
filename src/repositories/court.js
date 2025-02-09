const Repository = require('./common');
const TournamentRepository = require('./tournament');

class Court {
  constructor() {
    if (Court._instance) {
      return Court._instance;
    }
    Court._instance = this;

    this.db = new Repository().db;
    this.tournament = new TournamentRepository();
  }

  getAll() {
    return this.db.all(
        `SELECT c.number AS number, c.available AS available
         FROM tournament t
                  JOIN court c ON t.id = c.tournament_id
         WHERE t.current = 1
           AND t.available = 1`);
  }

  getById(id) {
    return this.db.get(
        `SELECT *
         FROM court
         WHERE id = ?`,
        [id]
    );
  }

  enableAll() {
    return this.db.run(
        `UPDATE court
         SET available = 1
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)`,
    );
  }

  enable(number) {
    return this.db.run(
        `UPDATE court
         SET available = 1
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND number = ?`,
        [number]
    );
  }

  disableAll() {
    return this.db.run(
        `UPDATE court
         SET available = 0
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)`
    );
  }

  disable(number) {
    return this.db.run(
        `UPDATE court
         SET available = 0
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND number = ?`,
        [number]
    );
  }

  countAvailable() {
    return this.db.get(
        `SELECT count(id) AS count
         FROM court
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND available = 1`
    )
    .then(result => result.count);
  }
}

module.exports = Court;