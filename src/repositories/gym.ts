import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Gym {
  declare static _instance: Gym | undefined;
  db!: DB;

  constructor() {
    if (Gym._instance) {
      return Gym._instance;
    }
    Gym._instance = this;

    this.db = new Repository().db;
  }

  select(user_club_id?: number) {
    return user_club_id ?
        this.db.all(
            `SELECT distinct g.id, g.name AS text
             FROM gym g
                      JOIN user_club_gym ucg on g.id = ucg.gym_id
             WHERE ucg.user_club_id = ?`,
            [user_club_id]
        ) :
        this.db.all(
            `SELECT id, name AS text
             FROM gym`
        );
  }
}

export default Gym;