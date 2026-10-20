import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Game {
  declare static _instance: Game | undefined;
  db!: DB;

  constructor() {
    if (Game._instance) {
      return Game._instance;
    }
    Game._instance = this;

    this.db = new Repository().db;
  }

  getById(id: number) {
    return this.db.get(
        `SELECT *
         FROM game
         WHERE id = ?`,
        [id]
    );
  }

  create(match_id: number, lost_1_by: string | null, lost_2_by: string | null, created_at: string) {
    return this.db.run(
        `INSERT INTO game (match_id,
                           lost_1_by,
                           lost_2_by,
                           created_at)
         VALUES (?, ?, ?, ?)`,
        [match_id, lost_1_by, lost_2_by, created_at]
    );
  }
}

export default Game;