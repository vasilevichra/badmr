const MatchRepository = require('../repositories/match')

class Match {
  constructor() {
    if (Match._instance) {
      return Match._instance;
    }
    Match._instance = this;

    this.match = new MatchRepository();
  }

  getAll = () => this.match.getAll();
  hasUnfinished = () => this.match.hasUnfinished();
  getAllUnfinished = () => this.match.getAllUnfinished();
  getAllFinishedAtLastSession = () => this.match.getAllFinishedAtLastSession();
  getById = (id) => this.match.getById(id);
  create = (user_1_id, user_2_id, user_3_id, user_4_id) => this.match.create(user_1_id, user_2_id, user_3_id, user_4_id);
  deleteById = (id) => this.match.deleteById(id);
}

module.exports = Match;