import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Team {
  declare static _instance: Team | undefined;
  db!: DB;

  constructor() {
    if (Team._instance) {
      return Team._instance;
    }
    Team._instance = this;
    this.db = new Repository().db;
  }

  create(tournament_id: number, group_id: number, name: string, city_id: number, team_color_id: number) {
    return this.db.run(
        `INSERT INTO team (tournament_id, group_id, name, city_id, team_color_id)
         VALUES (?, ?, ?, ?, ?)`,
        [tournament_id, group_id, name, city_id, team_color_id]
    );
  }

  setCity(team_id: number, city_id: number) {
    return this.db.run(
        `UPDATE team
         SET city_id = ?
         WHERE id = ?`,
        [city_id, team_id]
    );
  }

  setName(team_id: number, name: string) {
    return this.db.run(
        `UPDATE team
         SET name = ?
         WHERE id = ?`,
        [name, team_id]
    );
  }

  /** Команды котла в порядке добавления — вход раскладки корзин. */
  byGroup(group_id: number): { id: number; basket: number | null }[] {
    return this.db.all<{ id: number; basket: number | null }>(
        `SELECT id, basket
         FROM team
         WHERE group_id = ?
         ORDER BY id`,
        [group_id]
    );
  }

  setBasket(team_id: number, basket: number | null) {
    return this.db.run(
        `UPDATE team
         SET basket = ?
         WHERE id = ?`,
        [basket, team_id]
    );
  }
}

export default Team;