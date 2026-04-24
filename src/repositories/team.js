const Repository = require('./common');

class Team {
  constructor() {
    if (Team._instance) {
      return Team._instance;
    }
    Team._instance = this;
    this.db = new Repository().db;
  }

  create(tournament_id, group_id, name, city_id, team_color_id) {
    return this.db.run(
        `INSERT INTO team (tournament_id, group_id, name, city_id, team_color_id)
         VALUES (?, ?, ?, ?, ?)`,
        [tournament_id, group_id, name, city_id, team_color_id]
    );
  }

  setCity(team_id, city_id) {
    return this.db.run(
        `UPDATE team
         SET city_id = ?
         WHERE id = ?`,
        [city_id, team_id]
    );
  }

  setName(team_id, name) {
    return this.db.run(
        `UPDATE team
         SET name = ?
         WHERE id = ?`,
        [name, team_id]
    );
  }
}

module.exports = Team;