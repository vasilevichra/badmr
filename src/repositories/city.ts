import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class City {
  declare static _instance: City | undefined;
  db!: DB;

  constructor() {
    if (City._instance) {
      return City._instance;
    }
    City._instance = this;

    this.db = new Repository().db;
  }

  select(region_id?: number) {
    return region_id ?
        this.db.all(
            `SELECT c.id, c.name AS text
             FROM city c
                      JOIN region r ON c.region_id = r.id
             WHERE r.id = ?`,
            [region_id]
        ) :
        this.db.all(
            `SELECT id, name AS text
             FROM city`
        );
  }

  getById(id: number) {
    return this.db.get(
        `SELECT id, name
         FROM city c
         WHERE id = ?`,
        [id]
    );
  }

  getByTeamId(team_id: number) {
    return this.db.get(
        `SELECT c.id, c.name
         FROM city c
                  JOIN team t ON c.id = t.city_id
         WHERE t.id = ?`,
        [team_id]
    );
  }

  getByUserId(user_id: number) {
    return this.db.get(
        `SELECT c.id, c.name
         FROM city c
                  JOIN user u ON c.id = u.city_id
         WHERE u.id = ?`,
        [user_id]
    );
  }

  findByName(name: string) {
    return this.db.get(
        `SELECT c.id, c.name, c.region_id, r.state_id
         FROM city c
         JOIN region r ON c.region_id = r.id
         WHERE c.name = ?`,
        [name]
    );
  }
}

export default City;