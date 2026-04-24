const Repository = require('./common');

class TeamColor {
  constructor() {
    if (TeamColor._instance) {
      return TeamColor._instance;
    }
    TeamColor._instance = this;

    this.db = new Repository().db;
  }

  select() {
    return this.db.all(
        `SELECT tc.id, tc.name AS text, tc.hex
         FROM team_color tc
         WHERE id NOT IN (SELECT t.team_color_id
                          FROM team t
                                   JOIN tournament tt ON tt.id = t.tournament_id
                          WHERE tt.current = 1)`);
  }
}

module.exports = TeamColor;