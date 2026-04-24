const TeamRepository = require('../repositories/team');

class Team {
  constructor() {
    if (Team._instance) {
      return Team._instance;
    }
    Team._instance = this;

    this.team = new TeamRepository();
  }

  create = (tournament_id, group_id, name, city_id, team_color_id) => this.team.create(tournament_id, group_id, name, city_id, team_color_id);
  setCity = (team_id, city_id) => this.team.setCity(team_id, city_id);
  setName = (team_id, name) => this.team.setName(team_id, name);
}

module.exports = Team;