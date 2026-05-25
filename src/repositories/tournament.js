const Repository = require('./common');

class Tournament {
  constructor() {
    if (Tournament._instance) {
      return Tournament._instance;
    }
    Tournament._instance = this;

    this.db = new Repository().db;
  }

  create(type, name, registration, start, end, latitude, longitude, address, mapUrl, rules, current, courts, unit_id) {
    const createTournamentStatements = [[
      `INSERT INTO tournament (unit_id, tournament_type_id, tournament_state_id, name, current, available, reg_ended_at, started_at, ended_at, rules)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      unit_id || 1, type, 1, name, current, 1, registration, start, end, latitude, longitude, mapUrl, address, rules]];

    if (current === 1) {
      createTournamentStatements.unshift(
          `UPDATE tournament
           SET current = 0
           WHERE true;`
      );
    }

    // createTournamentStatements.push(`
    //     INSERT INTO court (tournament_id, number, available)
    //     VALUES ((SELECT id FROM tournament WHERE current = 1), (SELECT count() + 1
    //                                                             FROM court c
    //                                                                      JOIN tournament t on t.id = c.tournament_id
    //                                                             WHERE t.current = 1), 1)`
    // );

    return this.db.runStatementsWithTransaction(createTournamentStatements);
  }

  getCurrent() {
    return this.db.get(
        `SELECT t.*, g.city_id, g.latitude, g.longitude, g.address, g.map_url
         FROM tournament t
         JOIN gym g on g.id = t.gym_id
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
        `SELECT t.*, c.name AS city, g.latitude, g.longitude, g.address, g.map_url
         FROM tournament t
                  JOIN gym g on g.id = t.gym_id
                  JOIN city c ON c.id = g.city_id
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