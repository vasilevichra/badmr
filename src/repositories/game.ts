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

  getAllByMatchId(match_id: number) {
    return this.db.all(
        `SELECT *
         FROM game
         WHERE match_id = ?
         ORDER BY created_at, id`,
        [match_id]
    );
  }

  create(match_id: number, lost_1_by: string | null, lost_2_by: string | null, created_at: string) {
    // время приходит из печенек клиента (момент ввода счёта) и может быть
    // старше уже записанных игр матча: длительности в истории матчей
    // считаются разностями created_at соседних игр, инверсия перемешивает
    // их начало/окончание — поэтому не даём времени уходить в прошлое
    return this.db.run(
        `INSERT INTO game (match_id,
                           lost_1_by,
                           lost_2_by,
                           created_at)
         VALUES (?, ?, ?, max(?, (SELECT coalesce(max(created_at), ?) FROM game WHERE match_id = ?)))`,
        [match_id, lost_1_by, lost_2_by, created_at, created_at, match_id]
    );
  }

  update(id: number, lost_1_by: string | null, lost_2_by: string | null) {
    return this.db.run(
        `UPDATE game
         SET lost_1_by = ?,
             lost_2_by = ?
         WHERE id = ?`,
        [lost_1_by, lost_2_by, id]
    );
  }

  deleteById(id: number) {
    return this.db.run(
        `DELETE FROM game WHERE id = ?`,
        [id]
    );
  }
}

export default Game;