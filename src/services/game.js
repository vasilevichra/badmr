const GameRepository = require('../repositories/game');
const Game110Repository = require('../repositories/game110');

class Game {
  constructor() {
    if (Game._instance) {
      return Game._instance;
    }
    Game._instance = this;

    this.game = new GameRepository();
    this.game110 = new Game110Repository();
  }

  getById = (id) => this.game.getById(id);
  getCurrentByTeamIds = (teamId1, teamId2) => this.game110.getCurrentByTeamIds(teamId1, teamId2);
  increaseCurrentByTeamIds = (teamId1, teamId2, teamNumber) => this.game110.increaseCurrentByTeamIds(teamId1, teamId2, teamNumber);
  decreaseCurrentByTeamIds = (teamId1, teamId2) => this.game110.decreaseCurrentByTeamIds(teamId1, teamId2);
  create = (match_id, lost_1_by, lost_2_by, created_at) => this.game.create(match_id, lost_1_by, lost_2_by, created_at);
  create110 = (match_110_id) => this.game110.create(match_110_id);
}

module.exports = Game;