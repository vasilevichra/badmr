import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Court {
  declare static _instance: Court | undefined;
  db!: DB;

  constructor() {
    if (Court._instance) {
      return Court._instance;
    }
    Court._instance = this;

    this.db = new Repository().db;
  }

  create(tournament_id?: number) {
    return tournament_id ?
        this.db.run(
            `INSERT INTO court (tournament_id, number)
             VALUES (?, (SELECT count() + 1 FROM court c JOIN tournament t on t.id = c.tournament_id WHERE t.id = ?))`,
            [tournament_id, tournament_id]
        ) :
        this.db.run(
        `INSERT INTO court (tournament_id, number)
         VALUES ((SELECT id FROM tournament WHERE current = 1), (SELECT count() + 1 FROM court c JOIN tournament t on t.id = c.tournament_id WHERE t.current = 1))`
    );
  }

  getAll(tournamentId?: number) {
    return this.db.all(
        `SELECT c.id, c.number, c.available
         FROM tournament t
                  JOIN court c ON t.id = c.tournament_id
         WHERE t.id = coalesce(?, (SELECT id FROM tournament WHERE current = 1))`,
        [tournamentId ?? null]);
  }

  getById(id: number) {
    return this.db.get(
        `SELECT *
         FROM court
         WHERE id = ?`,
        [id]
    );
  }

  enableAll() {
    return this.db.run(
        `UPDATE court
         SET available = 1
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND id NOT IN (SELECT court_id FROM match WHERE finished = 0)
           AND id NOT IN (SELECT court_id FROM match_110 WHERE finished = 0)`,
    );
  }

  enable(number: number) {
    return this.db.run(
        `UPDATE court
         SET available = 1
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND number = ?`,
        [number]
    );
  }

  /** Корт занят, пока на нём идёт незавершённый матч (обычный или 110). */
  countBusy(number: number) {
    const result = this.db.get<{ count: number }>(
        `SELECT (SELECT count(*)
                 FROM match m
                          JOIN court c ON m.court_id = c.id
                 WHERE c.tournament_id = (SELECT id FROM tournament WHERE current = 1)
                   AND c.number = ?
                   AND m.finished = 0)
                      +
                 (SELECT count(*)
                  FROM match_110 m
                           JOIN court c ON m.court_id = c.id
                  WHERE c.tournament_id = (SELECT id FROM tournament WHERE current = 1)
                    AND c.number = ?
                    AND m.finished = 0) AS count`,
        [number, number]
    );
    return result!.count;
  }

  disableAll() {
    return this.db.run(
        `UPDATE court
         SET available = 0
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)`
    );
  }

  disable(number: number) {
    return this.db.run(
        `UPDATE court
         SET available = 0
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND number = ?`,
        [number]
    );
  }

  countAvailable(tournamentId?: number) {
    const result = this.db.get<{ count: number }>(
        `SELECT count(id) AS count
         FROM court
         WHERE tournament_id = coalesce(?, (SELECT id FROM tournament WHERE current = 1))
           AND available = 1`,
        [tournamentId ?? null]
    );
    return result!.count;
  }

  delete(id: number) {
    return this.db.run(
        `DELETE
         FROM court
         WHERE id = ?`,
        [id]
    );
  }

  deleteAll() {
    return this.db.run(
        `DELETE
         FROM court
         WHERE id IN (SELECT c.id
                      FROM court c
                               JOIN tournament t ON t.id = c.tournament_id
                      WHERE t.current = 1
                        AND t.available = 1)`
    );
  }
}

export default Court;