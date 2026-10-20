import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Game110 {
  declare static _instance: Game110 | undefined;
  db!: DB;

  constructor() {
    if (Game110._instance) {
      return Game110._instance;
    }
    Game110._instance = this;

    this.db = new Repository().db;
  }

  getById(id: number) {
    return this.db.get(
        `SELECT *
         FROM game_110
         WHERE id = ?`,
        [id]
    );
  }

  getCurrentByTeamIds(teamId1: number, teamId2: number) {
    return this.db.get<{ id: number }>(
        `SELECT g.*
         FROM game_110 g
                  JOIN match_110 m on g.match_110_id = m.id
                  JOIN tournament t on t.id = m.tournament_id
         WHERE t.current = 1
           AND m.finished = 0
           AND m.team_1_id = ?
           AND m.team_2_id = ?
           AND g.current = 1`,
        [teamId1, teamId2]
    );
  }

  increaseCurrentByTeamIds(teamId1: number, teamId2: number, teamNumber: string) {
    const g = this.getCurrentByTeamIds(teamId1, teamId2);
    return this.db.run(
        `UPDATE game_110
         SET score_${teamNumber} = score_${teamNumber} + 1
         WHERE id = ?`,
        [g!.id]
    );
  }

  create(match_110_id: number) {
    return this.db.run(
        `INSERT INTO game_110 (match_110_id, game_type_id, current)
         VALUES (?, 1, 1)`,
        [match_110_id]
    );
  }
}

export default Game110;