import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class ReadyPriority {
  declare static _instance: ReadyPriority | undefined;
  db!: DB;

  constructor() {
    if (ReadyPriority._instance) {
      return ReadyPriority._instance;
    }
    ReadyPriority._instance = this;

    this.db = new Repository().db;
  }

  select() {
    return this.db.all(
        `SELECT id, name AS text
         FROM ready_priority
         ORDER BY id`);
  }
}

export default ReadyPriority;
