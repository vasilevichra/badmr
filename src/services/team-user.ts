import TeamUserRepository from '../repositories/team-user.ts';

class TeamUser {
  declare static _instance: TeamUser | undefined;
  teamUser!: TeamUserRepository;

  constructor() {
    if (TeamUser._instance) {
      return TeamUser._instance;
    }
    TeamUser._instance = this;

    this.teamUser = new TeamUserRepository();
  }

  create = (team_id: number, user_id: number, group_id: number) => this.teamUser.create(team_id, user_id, group_id);
  setGroupId = (team_id: number, user_id: number, group_id: number) => this.teamUser.setGroupId(team_id, user_id, group_id);
}

export default TeamUser;