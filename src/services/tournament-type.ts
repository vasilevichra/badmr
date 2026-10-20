import TournamentTypeRepository from '../repositories/tournament-type.ts';

class TournamentType {
  declare static _instance: TournamentType | undefined;
  tournamentType!: TournamentTypeRepository;

  constructor() {
    if (TournamentType._instance) {
      return TournamentType._instance;
    }
    TournamentType._instance = this;

    this.tournamentType = new TournamentTypeRepository();
  }

  select = () => this.tournamentType.select();
}

export default TournamentType;