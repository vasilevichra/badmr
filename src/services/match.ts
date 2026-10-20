import MatchRepository from '../repositories/match.ts';
import Match110Repository from '../repositories/match110.ts';

class Match {
  declare static _instance: Match | undefined;
  match!: MatchRepository;
  match110!: Match110Repository;

  constructor() {
    if (Match._instance) {
      return Match._instance;
    }
    Match._instance = this;

    this.match = new MatchRepository();
    this.match110 = new Match110Repository();
  }

  getAll = () => this.match.getAll();
  hasUnfinished = () => this.match.hasUnfinished();
  getAllUnfinished = () => this.match.getAllUnfinished();
  getAllFinishedAtLastSession = () => this.match.getAllFinishedAtLastSession();
  getAllByUser = (user_id: number) => this.match.getAllByUser(user_id);
  getById = (id: number) => this.match.getById(id);
  create = (user_1_id: number, user_2_id: number, user_3_id: number, user_4_id: number) => this.match.create(user_1_id, user_2_id, user_3_id, user_4_id);
  create110 = (team_1_id: number, team_2_id: number) => this.match110.create(team_1_id, team_2_id);
  deleteById = (id: number) => this.match.deleteById(id);
}

export default Match;