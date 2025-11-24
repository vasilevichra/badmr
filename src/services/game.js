const GameRepository = require('../repositories/game')

class Game {
  constructor() {
    if (Game._instance) {
      return Game._instance;
    }
    Game._instance = this;

    this.game = new GameRepository();
  }

  getById = (id) => this.game.getById(id);
  create = (match_id, lost_1_by, lost_2_by) => this.game.create(match_id, lost_1_by, lost_2_by);
}

module.exports = Game;