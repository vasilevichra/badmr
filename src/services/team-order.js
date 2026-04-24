const TeamOrderRepository = require('../repositories/team-order');

class TeamOrder {
  constructor() {
    if (TeamOrder._instance) {
      return TeamOrder._instance;
    }
    TeamOrder._instance = this;

    this.teamOrder = new TeamOrderRepository();
  }

  position = (team_id, position_number) => this.teamOrder.position(team_id, position_number);
  select = (team_id, position_number) => this.teamOrder.select(team_id, position_number);
  set = (team_id, position_number, team_user_id) => this.teamOrder.set(team_id, position_number, team_user_id);
}

module.exports = TeamOrder;