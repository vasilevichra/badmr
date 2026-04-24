const TeamColorRepository = require('../repositories/team-color');

class TeamColor {
  constructor() {
    if (TeamColor._instance) {
      return TeamColor._instance;
    }
    TeamColor._instance = this;

    this.teamColor = new TeamColorRepository();

  }

  select = () => this.teamColor.select();
}

module.exports = TeamColor;