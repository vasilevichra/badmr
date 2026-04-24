const TeamUserRepository = require('../repositories/team-user');

class TeamUser {
  constructor() {
    if (TeamUser._instance) {
      return TeamUser._instance;
    }
    TeamUser._instance = this;

    this.teamUser = new TeamUserRepository();
  }

  create = (team_id, user_id, group_id) => this.teamUser.create(team_id, user_id, group_id);
  setGroupId = (team_id, user_id, group_id) => this.teamUser.setGroupId(team_id, user_id, group_id);
}

module.exports = TeamUser;