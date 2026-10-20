import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";
import SettingsService from '../services/settings.ts';
const settingsService = new SettingsService();

class Match {
  declare static _instance: Match | undefined;
  db!: DB;

  constructor() {
    if (Match._instance) {
      return Match._instance;
    }
    Match._instance = this;

    this.db = new Repository().db;
  }

  create(team_1_id: number, team_2_id: number) {
    return this.db.run(
        `INSERT INTO match_110 (tournament_id,
                               team_1_id,
                               team_2_id,
                               court_id)
         VALUES ((SELECT id FROM tournament WHERE current = 1),
                 ?,
                 ?,
                 (SELECT c.id FROM court c JOIN tournament t on c.tournament_id = t.id WHERE c.available = 1 AND t.current = 1 ORDER BY c.id LIMIT 1))`,
        [team_1_id, team_2_id]
    );
  }
}

export default Match;