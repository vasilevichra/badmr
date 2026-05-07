const TournamentTypeRepository = require('../repositories/tournament-type');

class TournamentType {
  constructor() {
    if (TournamentType._instance) {
      return TournamentType._instance;
    }
    TournamentType._instance = this;

    this.tournamentType = new TournamentTypeRepository();
  }

  select = () => this.tournamentType.select();
}

module.exports = TournamentType;