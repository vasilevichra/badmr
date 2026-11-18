import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";
import SettingsService from '../services/settings.ts';
import type { SlotRef } from '../services/bracket-structure.ts';
const settingsService = new SettingsService();

export interface Match110Row {
  id: number;
  tournament_id: number;
  created_at: string;
  team_1_id: number;
  team_2_id: number;
  court_id: number;
  stage: 'upper' | 'lower' | null;
  round: number | null;
  pos: number | null;
  finished: 0 | 1;
}

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

  // слот сетки пишется вместе с матчем; null-слот — свободная матрица
  // (сетка не генерировалась или круговая система)
  create(team_1_id: number, team_2_id: number, tournamentId?: number, slot?: SlotRef) {
    const tournament = tournamentId ?? '(SELECT id FROM tournament WHERE current = 1)';
    return this.db.run(
        `INSERT INTO match_110 (tournament_id,
                               team_1_id,
                               team_2_id,
                               court_id,
                               stage,
                               round,
                               pos)
         VALUES (${tournament},
                 ?,
                 ?,
                 (SELECT c.id FROM court c JOIN tournament t on c.tournament_id = t.id WHERE c.available = 1 AND t.id = ${tournament} ORDER BY c.id LIMIT 1),
                 ?,
                 ?,
                 ?)`,
        [team_1_id, team_2_id, slot?.stage ?? null, slot?.round ?? null, slot?.pos ?? null]
    );
  }

  /** Сеяние команд по силе (для посева сетки): рейтинг игрока — среднее его
   *  одиночного и парного рейтингов лаб (что из них есть); сила команды —
   *  среднее по её игрокам с рейтингом; команды без оценённых игроков —
   *  в конце. Без параметра — текущий турнир. */
  strengthOrder(tournamentId?: number): { team_id: number }[] {
    const tournamentFilter = tournamentId ? 't.tournament_id = ?' : 't.tournament_id = (SELECT id FROM tournament WHERE current = 1)';
    const rows = this.db.all<{ team_id: number; rating_1: number | null; rating_2: number | null }>(
        `SELECT t.id AS team_id,
                ul.rating_1 AS rating_1,
                ul.rating_2 AS rating_2
         FROM team t
                  LEFT JOIN team_user tu on tu.team_id = t.id
                  LEFT JOIN user_lab ul on tu.user_id = ul.user_id
         WHERE ${tournamentFilter}`,
        tournamentId ? [tournamentId] : []
    );
    const playerRating = (row: { rating_1: number | null; rating_2: number | null }): number | null => {
      const ratings = [row.rating_1, row.rating_2].filter((v): v is number => v !== null);
      return ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null;
    };
    const byTeam = new Map<number, { ratings: number[] }>();
    for (const row of rows) {
      const entry = byTeam.get(row.team_id) ?? { ratings: [] };
      const r = playerRating(row);
      if (r !== null) entry.ratings.push(r);
      byTeam.set(row.team_id, entry);
    }
    const strength = (ratings: number[]): number =>
      ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : -1;
    return [...byTeam.entries()]
        .sort((a, b) => strength(b[1].ratings) - strength(a[1].ratings))
        .map(([team_id]) => ({ team_id }));
  }

  getById(id: number): Match110Row | undefined {
    return this.db.get<Match110Row>(
        `SELECT * FROM match_110 WHERE id = ?`,
        [id]
    );
  }

  /** Матч слота сетки (idempotency роутинга: слот создаётся один раз). */
  getBySlot(tournamentId: number, slot: SlotRef): Match110Row | undefined {
    return this.db.get<Match110Row>(
        `SELECT * FROM match_110
         WHERE tournament_id = ? AND stage = ? AND round = ? AND pos = ?`,
        [tournamentId, slot.stage, slot.round, slot.pos]
    );
  }

  /** Есть ли матчи сетки у турнира (гейт повторной генерации). */
  hasSlotted(tournamentId: number): boolean {
    return (this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM match_110 WHERE tournament_id = ? AND stage IS NOT NULL`,
        [tournamentId]
    )?.n ?? 0) > 0;
  }

  /** Отдых команд турнира (без параметра — текущего): с какого момента
   *  команда ждёт — created_at последнего сыгранного матча, без сыгранных —
   *  старт турнира. played — число сыгранных матчей команды. */
  rests(tournamentId?: number) {
    const tournament = tournamentId ?? `(SELECT id FROM tournament WHERE current = 1)`;
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
         WHERE tt.id = ${tournament}`
    );
    const played = new Map(this.db.all<{team_id: number, played: number}>(
        `SELECT team_id, COUNT(*) AS played FROM (
             SELECT team_1_id AS team_id FROM match_110 WHERE finished = 1 AND tournament_id = ${tournament}
             UNION ALL
             SELECT team_2_id AS team_id FROM match_110 WHERE finished = 1 AND tournament_id = ${tournament}
         ) GROUP BY team_id`
    ).map(row => [row.team_id, row.played]));
    return {restStarts, played};
  }

  /** Число сыгранных (finished) матчей турнира — прогресс героя на телефоне
   *  после старта (полоска заполняется сыгранными матчами от матрицы). */
  playedCount(tournamentId?: number) {
    const tournament = tournamentId ?? `(SELECT id FROM tournament WHERE current = 1)`;
    return this.db.get<{n: number}>(
        `SELECT COUNT(*) AS n FROM match_110 WHERE finished = 1 AND tournament_id = ${tournament}`
    )?.n ?? 0;
  }
}

export default Match;