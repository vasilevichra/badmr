import TeamColorRepository from '../repositories/team-color.ts';

class TeamColor {
  declare static _instance: TeamColor | undefined;
  teamColor!: TeamColorRepository;

  constructor() {
    if (TeamColor._instance) {
      return TeamColor._instance;
    }
    TeamColor._instance = this;

    this.teamColor = new TeamColorRepository();

  }

  select = () => this.teamColor.select();
}

export default TeamColor;