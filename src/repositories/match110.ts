import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";
import BasketService from '../services/basket.ts';
import type { SlotRef } from '../services/bracket-structure.ts';
// ленивая инициализация: basket импортирует этот модуль ради гейта
// заморозки раскладки — верхнеуровневый new() здесь упал бы в цикле импортов
let basketService: BasketService | undefined;

export interface Match110Row {
  id: number;
  tournament_id: number;
  created_at: string;
  team_1_id: number;
  team_2_id: number;
  court_id: number;
  group_id: number | null;
  stage: 'upper' | 'lower' | 'group' | null;
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

  // слот сетки пишется вместе с матчем; null-слот — свободная матрица.
  // Котёл с групповым этапом: свободная матрица — групповой матч
  // (stage 'group'), сетка туда не смотрит; иначе матрица вне сетки (NULL).
  // group_id — котёл команды 1: слот уникален в рамках котла
  create(team_1_id: number, team_2_id: number, tournamentId?: number, slot?: SlotRef) {
    const tournament = tournamentId ?? '(SELECT id FROM tournament WHERE current = 1)';
    const tid = tournamentId ?? this.db.get<{ id: number }>(`SELECT id FROM tournament WHERE current = 1`)!.id;
    const groupId = this.db.get<{ group_id: number }>(`SELECT group_id FROM team WHERE id = ?`, [team_1_id])?.group_id ?? null;
    const stage = slot?.stage
        ?? (groupId !== null && (basketService ??= new BasketService()).groupStage(tid, groupId) ? 'group' : null);
    return this.db.run(
        `INSERT INTO match_110 (tournament_id,
                               team_1_id,
                               team_2_id,
                               court_id,
                               group_id,
                               stage,
                               round,
                               pos)
         VALUES (${tournament},
                 ?,
                 ?,
                 (SELECT c.id FROM court c JOIN tournament t on c.tournament_id = t.id WHERE c.available = 1 AND t.id = ${tournament} ORDER BY c.id LIMIT 1),
                 ?,
                 ?,
                 ?,
                 ?)`,
        [team_1_id, team_2_id, groupId, stage, slot?.round ?? null, slot?.pos ?? null]
    );
  }

  /** Сеяние команд по силе (для посева сетки): рейтинг игрока — среднее его
   *  одиночного и парного рейтингов лаб (что из них есть); сила команды —
   *  среднее по её игрокам с рейтингом; команды без оценённых игроков —
   *  в конце. Без параметра — текущий турнир. */
  strengthOrder(tournamentId?: number, groupId?: number): { team_id: number }[] {
    const tournamentFilter = tournamentId ? 't.tournament_id = ?' : 't.tournament_id = (SELECT id FROM tournament WHERE current = 1)';
    const groupFilter = groupId !== undefined ? ' AND t.group_id = ?' : '';
    const params = tournamentId ? (groupId !== undefined ? [tournamentId, groupId] : [tournamentId]) : (groupId !== undefined ? [groupId] : []);
    const rows = this.db.all<{ team_id: number; rating_1: number | null; rating_2: number | null }>(
        `SELECT t.id AS team_id,
                ul.rating_1 AS rating_1,
                ul.rating_2 AS rating_2
         FROM team t
                  LEFT JOIN team_user tu on tu.team_id = t.id
                  LEFT JOIN user_lab ul on tu.user_id = ul.user_id
         WHERE ${tournamentFilter}${groupFilter}`,
        params
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

  /** Матч слота сетки котла (idempotency роутинга: слот создаётся один раз;
   *  слоты уникальны в рамках котла). */
  getBySlot(tournamentId: number, groupId: number, slot: SlotRef): Match110Row | undefined {
    return this.db.get<Match110Row>(
        `SELECT * FROM match_110
         WHERE tournament_id = ? AND group_id = ? AND stage = ? AND round = ? AND pos = ?`,
        [tournamentId, groupId, slot.stage, slot.round, slot.pos]
    );
  }

  /** Есть ли матчи плей-офф у котла (гейт повторной генерации);
   *  групповые (stage 'group') сеткой не считаются. */
  hasSlotted(tournamentId: number, groupId: number): boolean {
    return (this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM match_110 WHERE tournament_id = ? AND group_id = ? AND stage IN ('upper', 'lower')`,
        [tournamentId, groupId]
    )?.n ?? 0) > 0;
  }

  /** Есть ли сыгранные матчи у котла (гейт заморозки раскладки корзин). */
  hasFinishedInGroup(tournamentId: number, groupId: number): boolean {
    return (this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM match_110 WHERE tournament_id = ? AND group_id = ? AND finished = 1`,
        [tournamentId, groupId]
    )?.n ?? 0) > 0;
  }

  /** Все матчи плей-офф котла в порядке создания. */
  getAllSlotted(tournamentId: number, groupId: number): Match110Row[] {    return this.db.all<Match110Row>(
        `SELECT * FROM match_110
         WHERE tournament_id = ? AND group_id = ? AND stage IN ('upper', 'lower')
         ORDER BY id`,
        [tournamentId, groupId]
    );
  }

  /** Есть ли несыгранные матчи группового этапа котла (гейт генерации плей-офф). */
  hasUnfinishedGroup(tournamentId: number, groupId: number): boolean {
    return (this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM match_110 WHERE tournament_id = ? AND group_id = ? AND stage = 'group' AND finished = 0`,
        [tournamentId, groupId]
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

  /** Строки сводной таблицы 110: на каждый матч — команды, счёт последней
   *  игры (счёт матча), флаг финиша и группы обеих команд. Незавершённые
   *  матчи входят с finished=0 — их отфильтрует сервис. */
  standingsRows(tournamentId?: number): StandingsRow[] {
    const tournament = tournamentId ?? `(SELECT id FROM tournament WHERE current = 1)`;
    return this.db.all<StandingsRow>(
        `SELECT m.id,
                m.team_1_id,
                m.team_2_id,
                g.score_1,
                g.score_2,
                m.finished,
                t1.group_id AS group_1_id,
                t2.group_id AS group_2_id,
                t1.basket AS basket_1,
                t2.basket AS basket_2,
                t1.name AS name_1,
                t2.name AS name_2,
                c1.name AS city_1,
                c2.name AS city_2
         FROM match_110 m
                  JOIN game_110 g ON g.match_110_id = m.id
                  JOIN team t1 ON t1.id = m.team_1_id
                  JOIN team t2 ON t2.id = m.team_2_id
                  JOIN city c1 ON c1.id = t1.city_id
                  JOIN city c2 ON c2.id = t2.city_id
         WHERE m.tournament_id = ${tournament}
           AND g.id = (SELECT MAX(g2.id) FROM game_110 g2 WHERE g2.match_110_id = m.id)
         ORDER BY m.id`
    );
  }
}

interface StandingsRow {
  id: number;
  team_1_id: number;
  team_2_id: number;
  score_1: number;
  score_2: number;
  finished: 0 | 1;
  group_1_id: number;
  group_2_id: number;
  basket_1: number | null;
  basket_2: number | null;
  name_1: string;
  name_2: string;
  city_1: string;
  city_2: string;
}

export default Match;