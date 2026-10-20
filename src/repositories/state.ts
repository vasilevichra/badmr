import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class State {
  declare static _instance: State | undefined;
  db!: DB;

  constructor() {
    if (State._instance) {
      return State._instance;
    }
    State._instance = this;

    this.db = new Repository().db;
  }

  select() {
    return this.db.all(
        `SELECT id, name AS text
         FROM state`);
  }

  getById(id: number) {
    return this.db.get(
        `SELECT id, name
         FROM state
         WHERE id = ?`,
        [id]
    );
  }

  getByUserId(user_id: number) {
    return this.db.get(
        `SELECT s.id, s.name
         FROM state s
                  JOIN region r on s.id = r.state_id
                  JOIN city c on r.id = c.region_id
                  JOIN user u ON c.id = u.city_id
         WHERE u.id = ?`,
        [user_id]
    );
  }
}

export default State;