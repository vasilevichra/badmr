const Repository = require('./common');

class Game110 {
  constructor() {
    if (Game110._instance) {
      return Game110._instance;
    }
    Game110._instance = this;

    this.db = new Repository().db;
  }

  getById(id) {
    return this.db.get(
        `SELECT *
         FROM game_110
         WHERE id = ?`,
        [id]
    );
  }

  getCurrentByTeamIds(teamId1, teamId2) {
    return this.db.get(
        `SELECT g.*
         FROM game_110 g
                  JOIN match_110 m on g.match_110_id = m.id
                  JOIN tournament t on t.id = m.tournament_id
         WHERE t.current = 1
           AND m.finished = 0
           AND m.team_1_id = ?
           AND m.team_2_id = ?
           AND g.current = 1`,
        [teamId1, teamId2]
    );
  }

  increaseCurrentByTeamIds(teamId1, teamId2, teamNumber) {
    return this.getCurrentByTeamIds(teamId1, teamId2)
    .then(g => this.db.run(
        `UPDATE game_110
         SET score_${teamNumber} = score_${teamNumber} + 1
         WHERE id = ?`,
        [g.id]
    ));
  }

  create(match_110_id) {
    return this.db.run(
        `INSERT INTO game_110 (match_110_id, game_type_id, current)
         VALUES (?, 1, 1)`,
        [match_110_id]
    );
  }
}

module.exports = Game110;