const Repository = require('./common');

class Game {
  constructor() {
    if (Game._instance) {
      return Game._instance;
    }
    Game._instance = this;

    this.db = new Repository().db;
  }

  getById(id) {
    return this.db.get(
        `SELECT *
         FROM game
         WHERE id = ?`,
        [id]
    );
  }

  create(match_id, lost_1_by, lost_2_by) {
    return this.db.run(
        `INSERT INTO game (match_id,
                           lost_1_by,
                           lost_2_by)
         VALUES (?, ?, ?)`,
        [match_id, lost_1_by, lost_2_by]
    );
  }
}

module.exports = Game;