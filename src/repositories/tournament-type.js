const Repository = require('./common');

class TournamentType {
  constructor() {
    if (TournamentType._instance) {
      return TournamentType._instance;
    }
    TournamentType._instance = this;

    this.db = new Repository().db;
  }

  select() {
    return this.db.all(
        `SELECT id, name AS text
         FROM tournament_type`);
  }
}

module.exports = TournamentType;