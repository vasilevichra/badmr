import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Unit {
  declare static _instance: Unit | undefined;
  db!: DB;

  constructor() {
    if (Unit._instance) {
      return Unit._instance;
    }
    Unit._instance = this;

    this.db = new Repository().db;
  }

  getAll() {
    return this.db.all(
        `SELECT *
         FROM unit u
         ORDER BY id DESC`);
  }
}

export default Unit;