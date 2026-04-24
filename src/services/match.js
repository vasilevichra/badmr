const MatchRepository = require('../repositories/match');
const Match110Repository = require('../repositories/match110');

class Match {
  constructor() {
    if (Match._instance) {
      return Match._instance;
    }
    Match._instance = this;

    this.match = new MatchRepository();
    this.match110 = new Match110Repository();
  }

  getAll = () => this.match.getAll();
  hasUnfinished = () => this.match.hasUnfinished();
  getAllUnfinished = () => this.match.getAllUnfinished();
  getAllFinishedAtLastSession = () => this.match.getAllFinishedAtLastSession();
  getAllByUser = (user_id) => this.match.getAllByUser(user_id);
  getById = (id) => this.match.getById(id);
  create = (user_1_id, user_2_id, user_3_id, user_4_id) => this.match.create(user_1_id, user_2_id, user_3_id, user_4_id);
  create110 = (team_1_id, team_2_id) => this.match110.create(team_1_id, team_2_id);
  deleteById = (id) => this.match.deleteById(id);
}

module.exports = Match;