import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class TournamentType {
  declare static _instance: TournamentType | undefined;
  db!: DB;

  constructor() {
    if (TournamentType._instance) {
      return TournamentType._instance;
    }
    TournamentType._instance = this;

    this.db = new Repository().db;
  }

  select() {
    return this.db.all(
        `SELECT id, name AS text
         FROM tournament_type`);
  }
}

export default TournamentType;