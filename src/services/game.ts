import GameRepository from '../repositories/game.ts';
import Game110Repository from '../repositories/game110.ts';
import RatingService from './rating.ts';

const ratingService = new RatingService();

class Game {
  declare static _instance: Game | undefined;
  game!: GameRepository;
  game110!: Game110Repository;

  constructor() {
    if (Game._instance) {
      return Game._instance;
    }
    Game._instance = this;

    this.game = new GameRepository();
    this.game110 = new Game110Repository();
  }

  getById = (id: number) => this.game.getById(id);
  getCurrentByTeamIds = (teamId1: number, teamId2: number) => this.game110.getCurrentByTeamIds(teamId1, teamId2);
  increaseCurrentByTeamIds = (teamId1: number, teamId2: number, teamNumber: string) => this.game110.increaseCurrentByTeamIds(teamId1, teamId2, teamNumber);

  create = (match_id: number, lost_1_by: string | null, lost_2_by: string | null, created_at: string) => {
    const result = this.game.create(match_id, lost_1_by, lost_2_by, created_at);
    // каскадный пересчёт рейтинга этого и последующих матчей — в фоне
    ratingService.scheduleRecalcFromMatch(match_id);
    return result;
  };

  update = (id: number, lost_1_by: string | null, lost_2_by: string | null) => {
    const result = this.game.update(id, lost_1_by, lost_2_by);
    const game = this.game.getById(id);
    if (game) ratingService.scheduleRecalcFromMatch(Number(game.match_id));
    return result;
  };

  deleteById = (id: number) => {
    const game = this.game.getById(id);
    const result = this.game.deleteById(id);
    if (game) ratingService.scheduleRecalcFromMatch(Number(game.match_id));
    return result;
  };

  create110 = (match_110_id: number) => this.game110.create(match_110_id);
}

export default Game;
