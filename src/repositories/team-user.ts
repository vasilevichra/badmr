import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class TeamUser {
  declare static _instance: TeamUser | undefined;
  db!: DB;

  constructor() {
    if (TeamUser._instance) {
      return TeamUser._instance;
    }
    TeamUser._instance = this;
    this.db = new Repository().db;
  }

  create(team_id: number, user_id: number, group_id: number) {
    return this.db.run(
        `INSERT INTO team_user (team_id, user_id, group_id)
         VALUES (?, ?, ?)`,
        [team_id, user_id, group_id]
    );
  }

  setGroupId(team_id: number, user_id: number, group_id: number) {
    return this.db.run(
        `UPDATE team_user
         SET group_id = ?
         WHERE team_id = ?
           AND user_id = ?`,
        [group_id, team_id, user_id]
    );
  }
}

export default TeamUser;