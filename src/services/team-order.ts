import TeamOrderRepository from '../repositories/team-order.ts';

class TeamOrder {
  declare static _instance: TeamOrder | undefined;
  teamOrder!: TeamOrderRepository;

  constructor() {
    if (TeamOrder._instance) {
      return TeamOrder._instance;
    }
    TeamOrder._instance = this;

    this.teamOrder = new TeamOrderRepository();
  }

  position = (team_id: number, position_number: number) => this.teamOrder.position(team_id, position_number);
  select = (team_id: number, position_number: number) => this.teamOrder.select(team_id, position_number);
  set = (team_id: number, position_number: number, team_user_id: number) => this.teamOrder.set(team_id, position_number, team_user_id);
}

export default TeamOrder;