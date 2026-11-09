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

  /** Отдых команд текущего турнира: с какого момента команда ждёт —
   *  created_at последнего сыгранного матча, без сыгранных — старт турнира.
   *  played — число сыгранных матчей команды. */
  rests() {
    const current = `(SELECT id FROM tournament WHERE current = 1)`;
    const restStarts = this.db.all<{team_id: number, rest_start: string}>(
        `SELECT t.id                                          AS team_id,
                COALESCE((SELECT MAX(m.created_at)
                          FROM match_110 m
                          WHERE m.tournament_id = tt.id
                            AND m.finished = 1
                            AND (m.team_1_id = t.id OR m.team_2_id = t.id)),
                         tt.started_at)                     AS rest_start
         FROM team t
                  JOIN tournament tt on tt.id = t.tournament_id
         WHERE tt.current = 1`
    );
    const played = new Map(this.db.all<{team_id: number, played: number}>(
        `SELECT team_id, COUNT(*) AS played FROM (
             SELECT team_1_id AS team_id FROM match_110 WHERE finished = 1 AND tournament_id = ${current}
             UNION ALL
             SELECT team_2_id AS team_id FROM match_110 WHERE finished = 1 AND tournament_id = ${current}
         ) GROUP BY team_id`
    ).map(row => [row.team_id, row.played]));
    return {restStarts, played};
  }
}

export default Match;