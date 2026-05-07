const Repository = require('./common');

class Tournament {
  constructor() {
    if (Tournament._instance) {
      return Tournament._instance;
    }
    Tournament._instance = this;

    this.db = new Repository().db;
  }

  create(type, name, registration, start, end, latitude, longitude, address, mapUrl, rules, current, unit_id) {
    const createTournamentStatements = [[
      `INSERT INTO tournament (unit_id, tournament_type_id, tournament_state_id, name, current, available, reg_ended_at, started_at, ended_at,
                               latitude, longitude, map_url, address, rules)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      unit_id || 1, type, 1, name, current, 1, registration, start, end, latitude, longitude, mapUrl, address, rules]];

    if (current === 1) {
      createTournamentStatements.unshift(
          `UPDATE tournament
           SET current = 0
           WHERE true;`
      );
    }

    return this.db.runStatementsWithTransaction(createTournamentStatements);
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