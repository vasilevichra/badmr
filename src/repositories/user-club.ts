import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class UserClub {
  declare static _instance: UserClub | undefined;
  db!: DB;

  constructor() {
    if (UserClub._instance) {
      return UserClub._instance;
    }
    UserClub._instance = this;

    this.db = new Repository().db;
  }

  select() {
    return this.db.all(
        `SELECT id, name AS text
         FROM user_club`
    );
  }
}

export default UserClub;