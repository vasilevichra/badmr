import TeamRepository from '../repositories/team.ts';

class Team {
  declare static _instance: Team | undefined;
  team!: TeamRepository;

  constructor() {
    if (Team._instance) {
      return Team._instance;
    }
    Team._instance = this;

    this.team = new TeamRepository();
  }

  create = (tournament_id: number, group_id: number, name: string, city_id: number, team_color_id: number) => this.team.create(tournament_id, group_id, name, city_id, team_color_id);
  setCity = (team_id: number, city_id: number) => this.team.setCity(team_id, city_id);
  setName = (team_id: number, name: string) => this.team.setName(team_id, name);
}

export default Team;