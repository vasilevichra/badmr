import Repository from './common.ts';
import DB, { type RunResult, type SqliteParam } from "../db.ts";

class Rating {
  declare static _instance: Rating | undefined;
  db!: DB;

  constructor() {
    if (Rating._instance) {
      return Rating._instance;
    }
    Rating._instance = this;

    this.db = new Repository().db;
  }

  getByUserId(user_id: number) {
    return this.db.all(
        `SELECT g.created_at AS x, (r.previous + r.delta) AS y
         FROM rating r
                  JOIN user u ON r.user_id = u.id
                  JOIN match m ON r.match_id = m.id
                  JOIN (SELECT match_id, created_at, max(id) AS mid FROM game GROUP BY match_id) g ON m.id = g.match_id
         WHERE u.id = ?
         ORDER BY g.created_at`,
        [user_id]
    );
  }

  getById<T = Record<string, unknown>>(id: number) {
    return this.db.get<T>(
        `SELECT * FROM match WHERE id = ?`,
        [id]
    );
  }

  /** Хронологический ключ матча: время последней игры (как в графике рейтинга),
   *  без игр — время создания матча. */
  getChronKey(id: number) {
    return this.db.get<{ chron: string }>(
        `SELECT coalesce((SELECT max(g.created_at) FROM game g WHERE g.match_id = m.id), m.created_at) AS chron
         FROM match m
         WHERE m.id = ?`,
        [id]
    )!.chron;
  }

  /** Завершённые матчи любого из игроков, случившиеся позже minChron
   *  (по хронологическому ключу) — кандидаты каскадного пересчёта. */
  getLaterFinishedMatches(userIds: number[], minChron: string, excludeMatchId: number) {
    const placeholders = userIds.map(() => '?').join(', ');
    return this.db.all<{ id: number; user_1_id: number; user_2_id: number; user_3_id: number; user_4_id: number; created_at: string; chron: string }>(
        `SELECT m.id,
                m.user_1_id,
                m.user_2_id,
                m.user_3_id,
                m.user_4_id,
                m.created_at,
                coalesce((SELECT max(g.created_at) FROM game g WHERE g.match_id = m.id), m.created_at) AS chron
         FROM match m
         WHERE m.id != ?
           AND m.finished = 1
           AND coalesce((SELECT max(g.created_at) FROM game g WHERE g.match_id = m.id), m.created_at) > ?
           AND (m.user_1_id IN (${placeholders})
             OR m.user_2_id IN (${placeholders})
             OR m.user_3_id IN (${placeholders})
             OR m.user_4_id IN (${placeholders}))`,
        [excludeMatchId, minChron, ...userIds, ...userIds, ...userIds, ...userIds]
    );
  }

  /** Игры затронутых матчей — для пересчёта счёта по командам. */
  getGamesByMatchIds(ids: number[]) {
    const placeholders = ids.map(() => '?').join(', ');
    return this.db.all<{ match_id: number; lost_1_by: number | null; lost_2_by: number | null }>(
        `SELECT match_id, lost_1_by, lost_2_by FROM game WHERE match_id IN (${placeholders})`,
        ids
    );
  }

  /** Последняя строка рейтинга игрока вне затронутых матчей —
   *  состояние цепочки на момент первого пересчитываемого матча.
   *  Сиды (match_id IS NULL) не должны отсекаться NULL-сравнением. */
  getLastRatingExcludingMatchIds(user_id: number, ids: number[]) {
    const placeholders = ids.map(() => '?').join(', ');
    return this.db.get<{ previous: number; delta: number | null; stale: number | null; series: number | null; date: string | null }>(
        `SELECT r.previous, r.delta, r.stale, r.series, m.created_at AS date
         FROM rating r
                  LEFT JOIN match m ON m.id = r.match_id
         WHERE r.user_id = ?
           AND (r.match_id IS NULL OR r.match_id NOT IN (${placeholders}))
         ORDER BY r.id DESC
         LIMIT 1`,
        [user_id, ...ids]
    );
  }

  /** Существующие строки рейтинга затронутых матчей — для no-op сравнения. */
  getRowsByMatchIds(ids: number[]) {
    const placeholders = ids.map(() => '?').join(', ');
    return this.db.all<{ match_id: number; user_id: number; previous: number; delta: number | null; stale: number | null; series: number | null }>(
        `SELECT match_id, user_id, previous, delta, stale, series
         FROM rating
         WHERE match_id IN (${placeholders})
         ORDER BY id`,
        ids
    );
  }

  deleteByMatchIds(ids: number[]) {
    const placeholders = ids.map(() => '?').join(', ');
    return this.db.run(
        `DELETE FROM rating WHERE match_id IN (${placeholders})`,
        ids
    );
  }

  setFinished(id: number, finished: number) {
    return this.db.run(
        `UPDATE match SET finished = ? WHERE id = ?`,
        [finished, id]
    );
  }

  /** Освобождение корта и участников при расфинишивании матча —
   *  зеркально триггеру enable_resources_when_match_finished.
   *  Возвращает стейтменты для включения в общую транзакцию пересчёта. */
  releaseResourceStatements(id: number): SqliteParam[][] {
    return [
        [`UPDATE court SET available = 1 WHERE id = (SELECT court_id FROM match WHERE id = ?)`, id],
        [`UPDATE tournament_user
          SET available = 1
          WHERE (user_id IN (SELECT user_1_id FROM match WHERE id = ?)
              OR user_id IN (SELECT user_2_id FROM match WHERE id = ?)
              OR user_id IN (SELECT user_3_id FROM match WHERE id = ?)
              OR user_id IN (SELECT user_4_id FROM match WHERE id = ?))
            AND tournament_id IN (SELECT id FROM tournament AS t WHERE t.available = 1)`,
          id, id, id, id],
    ];
  }

  apply(statements: SqliteParam[][]): RunResult[] {
    return this.db.transaction(statements);
  }
}

export default Rating;