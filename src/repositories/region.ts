import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Region {
  declare static _instance: Region | undefined;
  db!: DB;

  constructor() {
    if (Region._instance) {
      return Region._instance;
    }
    Region._instance = this;

    this.db = new Repository().db;
  }

  select(state_id?: number) {
    return state_id ?
        this.db.all(
            `SELECT r.id, r.name AS text, t.id AS timezone_id, t.name AS timezone
             FROM region r
                      JOIN state s on s.id = r.state_id
                      LEFT JOIN region_timezone rt ON rt.region_id = r.id
                      LEFT JOIN timezone t ON t.id = rt.timezone_id
             WHERE s.id = ?`,
            [state_id]
        ) :
        this.db.all(
            `SELECT r.id, r.name AS text, t.id AS timezone_id, t.name AS timezone
             FROM region r
                      LEFT JOIN region_timezone rt ON rt.region_id = r.id
                      LEFT JOIN timezone t ON t.id = rt.timezone_id`
        );
  }

  getById(id: number) {
    return this.db.get(
        `SELECT id, name
         FROM region
         WHERE id = ?`,
        [id]
    );
  }

  getByUserId(user_id: number) {
    return this.db.get(
        `SELECT r.id, r.name
         FROM region r
                  JOIN city c on r.id = c.region_id
                  JOIN user u ON c.id = u.city_id
         WHERE u.id = ?`,
        [user_id]
    );
  }
}

export default Region;