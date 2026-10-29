import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";
import SettingsService from '../services/settings.ts';
const settingsService = new SettingsService();

interface GetInfoRow {
  match_id: number;
  game_id: number;
}

/** Строка лаконичного списка матчей пользователя по турнирам одного типа:
 *  участники — «Фамилия И.», счёт — выигранные игры по парам. */
export interface SameTypeMatchRow {
  match_id: number;
  match_created_at: string;
  tournament_id: number;
  tournament_name: string;
  tournament_type_name: string;
  tournament_city: string;
  user_1_id: number;
  user_2_id: number;
  user_3_id: number;
  user_4_id: number;
  name1: string;
  name2: string;
  name3: string;
  name4: string;
  sex1: number;
  sex2: number;
  sex3: number;
  sex4: number;
  pic1: string | null;
  pic2: string | null;
  pic3: string | null;
  pic4: string | null;
  /** выигранных игр у пары 1 (user_1/user_2) */
  wins1: number;
  /** выигранных игр у пары 2 (user_3/user_4) */
  wins2: number;
  /** дельта рейтинга игрока карточки в этом матче */
  delta: number | null;
}

type GetInfoRequest = (max_point: number, game_point: number, user_id: number, tournament_id?: number) => GetInfoRow[];

class Match {
  declare static _instance: Match | undefined;
  db!: DB;

  /** Порог калибровки для фильтра дельт: матчи калибровочной серии
   *  (stale=1, series 1..calibration_matches) не показывают дельту. */
  private calibrationMatches(tournamentId?: number): number {
    return Number(settingsService.get('calibration_matches', tournamentId)) || 0;
  }

  constructor() {
    if (Match._instance) {
      return Match._instance;
    }
    Match._instance = this;

    this.db = new Repository().db;
  }

  getAll() {
    return this.db.all(
        `SELECT *
         FROM match m
         WHERE m.tournament_id = (SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)`
    );
  }

  hasUnfinished() {
    return this.db.get(
        `SELECT count(m.id) > 0 AS has
         FROM match m
                  JOIN tournament t on t.id = m.tournament_id
         WHERE t.current = 1
           AND t.available = 1
           AND m.finished = 0`
    );
  }

  getAllUnfinished() {
    return this.db.all(
        `SELECT m.id                                                   AS id,
                m.user_1_id                                            AS user_1_id,
                m.user_2_id                                            AS user_2_id,
                m.user_3_id                                            AS user_3_id,
                m.user_4_id                                            AS user_4_id,
                u1.sex                                                 AS sex1,
                u2.sex                                                 AS sex2,
                u3.sex                                                 AS sex3,
                u4.sex                                                 AS sex4,
                (SELECT pic FROM user_pic WHERE user_id = m.user_1_id) AS pic1,
                (SELECT pic FROM user_pic WHERE user_id = m.user_2_id) AS pic2,
                (SELECT pic FROM user_pic WHERE user_id = m.user_3_id) AS pic3,
                (SELECT pic FROM user_pic WHERE user_id = m.user_4_id) AS pic4,
                u1.lastname || ' ' || u1.firstname                     AS name1,
                u2.lastname || ' ' || u2.firstname                     AS name2,
                u3.lastname || ' ' || u3.firstname                     AS name3,
                u4.lastname || ' ' || u4.firstname                     AS name4,
                c.number                                               AS court
         FROM match m
                  JOIN user u1 on u1.id = m.user_1_id
                  JOIN user u2 on u2.id = m.user_2_id
                  JOIN user u3 on u3.id = m.user_3_id
                  JOIN user u4 on u4.id = m.user_4_id
                  JOIN court c on c.id = m.court_id
         WHERE m.tournament_id = (SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)
           AND m.finished = 0`
    );
  }

  getAllFinishedAtLastSession = (tournamentId?: number) => this.getInfo(this.getAllFinishedAtLastSessionRequest, 0, tournamentId);
  getAllByUser = (user_id: number, tournamentId?: number) => this.getInfo(this.getAllByUserRequest, user_id, tournamentId);

  getInfo(request: GetInfoRequest, user_id: number = 0, tournamentId?: number) {
    const max_point = Number(settingsService.get('max_point'));
    const game_point = Number(settingsService.get('game_point'));
    const raw = request(max_point, game_point, user_id, tournamentId);
    // группировка через Map: сохраняет порядок строк запроса (ORDER BY),
    // в отличие от Object.groupBy + for...in, где числоподобные ключи
    // итерируются по возрастанию независимо от порядка вставки
    const rawMatches = new Map<number, GetInfoRow[]>();
    for (const row of raw as GetInfoRow[]) {
      const rows = rawMatches.get(row.match_id);
      if (rows) {
        rows.push(row);
      } else {
        rawMatches.set(row.match_id, [row]);
      }
    }
    const matches: Record<string, Partial<Record<number, GetInfoRow[]>>>[] = [];
    for (const [matchId, rows] of rawMatches) {
      matches.push({[matchId]: Object.groupBy(rows, (row: GetInfoRow) => row.game_id) as Partial<Record<number, GetInfoRow[]>>});
    }
    return matches;
  }

  getAllFinishedAtLastSessionRequest = (max_point: number, game_point: number, user_id: number, tournament_id?: number) => this.db.all<GetInfoRow>(
      `SELECT m.id                                                                                                                AS match_id,
              m.created_at                                                                                                        AS match_created_at,
              m.user_1_id                                                                                                         AS user_1_id,
              m.user_2_id                                                                                                         AS user_2_id,
              m.user_3_id                                                                                                         AS user_3_id,
              m.user_4_id                                                                                                         AS user_4_id,
              u1.sex                                                                                                              AS sex1,
              u2.sex                                                                                                              AS sex2,
              u3.sex                                                                                                              AS sex3,
              u4.sex                                                                                                              AS sex4,
              u1.lastname || ' ' || u1.firstname                                                                                  AS name1,
              u2.lastname || ' ' || u2.firstname                                                                                  AS name2,
              u3.lastname || ' ' || u3.firstname                                                                                  AS name3,
              u4.lastname || ' ' || u4.firstname                                                                                  AS name4,
              (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_1_id)                                                AS pic1,
              (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_2_id)                                                AS pic2,
              (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_3_id)                                                AS pic3,
              (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_4_id)                                                AS pic4,
              c.number                                                                                                            AS court,
              g.id                                                                                                                AS game_id,
              CASE
                  WHEN g.lost_1_by IS NOT NULL THEN g.lost_1_by
                  WHEN g.lost_2_by < $game_point - 1 THEN $game_point
                  WHEN g.lost_2_by >= $game_point - 1 AND g.lost_2_by < $max_point - 1 THEN g.lost_2_by + 2
                  WHEN g.lost_2_by == $max_point - 1 THEN $max_point END                                                          AS lost_1_by,
              CASE
                  WHEN g.lost_2_by IS NOT NULL THEN g.lost_2_by
                  WHEN g.lost_1_by < $game_point - 1 THEN $game_point
                  WHEN g.lost_1_by >= $game_point - 1 AND g.lost_1_by < $max_point - 1 THEN g.lost_1_by + 2
                  WHEN g.lost_1_by == $max_point - 1 THEN $max_point END                                                          AS lost_2_by,
              g.created_at                                                                                                        AS game_created_at,
              (SELECT sum(coalesce(previous, 0)) / 2 FROM rating WHERE user_id IN (m.user_1_id, m.user_2_id) AND match_id = m.id) AS rating1,
              (SELECT sum(coalesce(previous, 0)) / 2 FROM rating WHERE user_id IN (m.user_3_id, m.user_4_id) AND match_id = m.id) AS rating2,
              -- дельта матча калибровки не показывается (NULL — пустая ячейка):
              -- усиленный K не отражает спортивный результат
              (SELECT CASE WHEN stale = 1 AND series BETWEEN 1 AND $calibration_matches THEN NULL
                           ELSE delta END
               FROM rating WHERE user_id = m.user_1_id AND match_id = m.id)                             AS delta1 -- delta2 вычисляется сменой знака
       FROM match m
                JOIN user u1 on u1.id = m.user_1_id
                JOIN user u2 on u2.id = m.user_2_id
                JOIN user u3 on u3.id = m.user_3_id
                JOIN user u4 on u4.id = m.user_4_id
                JOIN court c on c.id = m.court_id
                JOIN game g on m.id = g.match_id
       WHERE m.tournament_id = coalesce($tid, (SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1))
         AND m.finished = 1
         -- «последняя сессия» — день последнего ЗАВЕРШЁННОГО матча: начатая
         -- позже сессия с незавершёнными матчами не должна скрывать историю
         AND date(m.created_at) = (SELECT date(created_at) AS date FROM match WHERE tournament_id = coalesce($tid, (SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)) AND finished = 1 ORDER BY id DESC LIMIT 1)
       ORDER BY date(m.created_at) DESC, m.id DESC`,
      { $game_point: game_point, $max_point: max_point, $tid: tournament_id ?? null, $calibration_matches: this.calibrationMatches(tournament_id) }
  )

  getAllByUserRequest = (max_point: number, game_point: number, user_id: number, tournament_id?: number) => this.db.all<GetInfoRow>(
      `SELECT m.id                                                                                                                AS match_id,
              m.created_at                                                                                                        AS match_created_at,
              m.user_1_id                                                                                                         AS user_1_id,
              m.user_2_id                                                                                                         AS user_2_id,
              m.user_3_id                                                                                                         AS user_3_id,
              m.user_4_id                                                                                                         AS user_4_id,
              u1.sex                                                                                                              AS sex1,
              u2.sex                                                                                                              AS sex2,
              u3.sex                                                                                                              AS sex3,
              u4.sex                                                                                                              AS sex4,
              u1.lastname || ' ' || u1.firstname                                                                                  AS name1,
              u2.lastname || ' ' || u2.firstname                                                                                  AS name2,
              u3.lastname || ' ' || u3.firstname                                                                                  AS name3,
              u4.lastname || ' ' || u4.firstname                                                                                  AS name4,
              (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_1_id)                                                AS pic1,
              (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_2_id)                                                AS pic2,
              (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_3_id)                                                AS pic3,
              (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = m.user_4_id)                                                AS pic4,
              c.number                                                                                                            AS court,
              g.id                                                                                                                AS game_id,
              CASE
                  WHEN g.lost_1_by IS NOT NULL THEN g.lost_1_by
                  WHEN g.lost_2_by < $game_point - 1 THEN $game_point
                  WHEN g.lost_2_by >= $game_point - 1 AND g.lost_2_by < $max_point - 1 THEN g.lost_2_by + 2
                  WHEN g.lost_2_by == $max_point - 1 THEN $max_point END                                                          AS lost_1_by,
              CASE
                  WHEN g.lost_2_by IS NOT NULL THEN g.lost_2_by
                  WHEN g.lost_1_by < $game_point - 1 THEN $game_point
                  WHEN g.lost_1_by >= $game_point - 1 AND g.lost_1_by < $max_point - 1 THEN g.lost_1_by + 2
                  WHEN g.lost_1_by == $max_point - 1 THEN $max_point END                                                          AS lost_2_by,
              g.created_at                                                                                                        AS game_created_at,
              (SELECT sum(coalesce(previous, 0)) / 2 FROM rating WHERE user_id IN (m.user_1_id, m.user_2_id) AND match_id = m.id) AS rating1,
              (SELECT sum(coalesce(previous, 0)) / 2 FROM rating WHERE user_id IN (m.user_3_id, m.user_4_id) AND match_id = m.id) AS rating2,
              (SELECT CASE WHEN stale = 1 AND series BETWEEN 1 AND $calibration_matches THEN NULL
                           ELSE delta END
               FROM rating WHERE user_id = m.user_1_id AND match_id = m.id)                             AS delta1 -- delta2 вычисляется сменой знака
       FROM match m
                JOIN user u1 on u1.id = m.user_1_id
                JOIN user u2 on u2.id = m.user_2_id
                JOIN user u3 on u3.id = m.user_3_id
                JOIN user u4 on u4.id = m.user_4_id
                JOIN court c on c.id = m.court_id
                JOIN game g on m.id = g.match_id
       WHERE m.tournament_id = coalesce($tournament_id,
                                          (SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1))
         AND m.finished = 1
         AND (u1.id = $user_id OR u2.id = $user_id OR u3.id = $user_id OR u4.id = $user_id)
       ORDER BY m.id DESC`,
      { $game_point: game_point, $max_point: max_point, $user_id: user_id, $tournament_id: tournament_id ?? null, $calibration_matches: this.calibrationMatches(tournament_id) }
  )

  /**
   * Все доигранные матчи пользователя в турнирах того же типа (type_id),
   * кроме турнира excludeTournamentId, — по одной строке на матч:
   * дата, турнир, участники («Фамилия И.») и счёт по парам — формат
   * лаконичного свёрнутого списка в карточке игрока (#57).
   */
  getAllByUserSameType = (user_id: number, type_id: number, excludeTournamentId?: number) => this.db.all<SameTypeMatchRow>(
      `SELECT m.id                                                                AS match_id,
              m.created_at                                                        AS match_created_at,
              t.id                                                                AS tournament_id,
              t.name                                                              AS tournament_name,
              tt.name                                                             AS tournament_type_name,
              c.name                                                              AS tournament_city,
              m.user_1_id                                                         AS user_1_id,
              m.user_2_id                                                         AS user_2_id,
              m.user_3_id                                                         AS user_3_id,
              m.user_4_id                                                         AS user_4_id,
              u1.lastname || ' ' || substr(u1.firstname, 1, 1) || '.'             AS name1,
              u2.lastname || ' ' || substr(u2.firstname, 1, 1) || '.'             AS name2,
              u3.lastname || ' ' || substr(u3.firstname, 1, 1) || '.'             AS name3,
              u4.lastname || ' ' || substr(u4.firstname, 1, 1) || '.'             AS name4,
              u1.sex                                                              AS sex1,
              u2.sex                                                              AS sex2,
              u3.sex                                                              AS sex3,
              u4.sex                                                              AS sex4,
              (SELECT pic FROM user_pic WHERE user_id = m.user_1_id)              AS pic1,
              (SELECT pic FROM user_pic WHERE user_id = m.user_2_id)              AS pic2,
              (SELECT pic FROM user_pic WHERE user_id = m.user_3_id)              AS pic3,
              (SELECT pic FROM user_pic WHERE user_id = m.user_4_id)              AS pic4,
              (SELECT count(*) FROM game g WHERE g.match_id = m.id AND g.lost_2_by IS NOT NULL) AS wins1,
              (SELECT count(*) FROM game g WHERE g.match_id = m.id AND g.lost_1_by IS NOT NULL) AS wins2,
              -- дельта матча калибровки не показывается (NULL — пустая ячейка)
              (SELECT CASE WHEN r.stale = 1 AND r.series BETWEEN 1 AND $calibration_matches THEN NULL
                           ELSE r.delta END
               FROM rating r WHERE r.match_id = m.id AND r.user_id = $user_id)   AS delta
       FROM match m
                JOIN tournament t ON t.id = m.tournament_id
                JOIN gym g ON g.id = t.gym_id
                JOIN city c ON c.id = g.city_id
                JOIN tournament_type tt ON tt.id = t.tournament_type_id
                JOIN user u1 on u1.id = m.user_1_id
                JOIN user u2 on u2.id = m.user_2_id
                JOIN user u3 on u3.id = m.user_3_id
                JOIN user u4 on u4.id = m.user_4_id
       WHERE m.finished = 1
         AND $user_id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
         AND t.tournament_type_id = $type_id
         AND t.id != coalesce($exclude, -1)
       ORDER BY m.created_at DESC, m.id DESC`,
      { $user_id: user_id, $type_id: type_id, $exclude: excludeTournamentId ?? null, $calibration_matches: this.calibrationMatches() }
  )

  /** Медиана времени (секунд) на зарабатывание одного очка по завершённым
   *  матчам, длившимся больше минуты. Длительность матча — от created_at
   *  до последней игры, очки — суммы счёта обеих пар по всем играм
   *  (незаписанный счёт выигравшего вычисляется по правилам бадминтона).
   *  Медиана вместо среднего: один затянувшийся матч не портит показатель. */
  getMedianSecondsPerPoint(current_only: boolean, tournamentId?: number) {
    return this.db.get<{value: number}>(
        `SELECT avg(t.spd) AS value
         FROM (SELECT s.dur * 1.0 / s.points                              AS spd,
                      ROW_NUMBER() OVER (ORDER BY s.dur * 1.0 / s.points) AS rn,
                      COUNT(*) OVER ()                                    AS n
               FROM (SELECT m.id                                                                    AS match_id,
                            (julianday((SELECT max(created_at) FROM game WHERE match_id = m.id)) -
                             julianday(m.created_at)) * 86400                                       AS dur,
                            sum(CASE
                                    WHEN g.lost_1_by IS NOT NULL THEN g.lost_1_by
                                    WHEN g.lost_2_by < $game_point - 1 THEN $game_point
                                    WHEN g.lost_2_by < $max_point - 1 THEN g.lost_2_by + 2
                                    ELSE $max_point END +
                                CASE
                                    WHEN g.lost_2_by IS NOT NULL THEN g.lost_2_by
                                    WHEN g.lost_1_by < $game_point - 1 THEN $game_point
                                    WHEN g.lost_1_by < $max_point - 1 THEN g.lost_1_by + 2
                                    ELSE $max_point END)                                            AS points
                     FROM match m
                              JOIN game g ON g.match_id = m.id
                     WHERE m.finished = 1
                       ${current_only ? `AND m.tournament_id = ${tournamentId ?? '(SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)'}` : ''}
                     GROUP BY m.id) AS s
               WHERE s.dur > 60
                 AND s.points > 0) t
         WHERE t.rn IN ((t.n + 1) / 2, (t.n + 2) / 2)`,
        { $game_point: Number(settingsService.get('game_point')), $max_point: Number(settingsService.get('max_point')) }
    )?.value ?? null;
  }

  /** Медианная длительность матча в секундах (та же выборка, что у
   *  getMedianSecondsPerPoint: матчи короче минуты не учитываются). */
  getMedianMatchSeconds(current_only: boolean, tournamentId?: number) {
    return this.db.get<{value: number}>(
        `SELECT avg(t.dur) AS value
         FROM (SELECT s.dur,
                      ROW_NUMBER() OVER (ORDER BY s.dur) AS rn,
                      COUNT(*) OVER ()                   AS n
               FROM (SELECT m.id                                                                        AS match_id,
                      CAST(strftime('%s', (SELECT max(created_at) FROM game WHERE match_id = m.id)) AS INTEGER) -
                      CAST(strftime('%s', m.created_at) AS INTEGER)                               AS dur
               FROM match m
                        JOIN game g ON g.match_id = m.id
               WHERE m.finished = 1
                 ${current_only ? `AND m.tournament_id = ${tournamentId ?? '(SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)'}` : ''}
               GROUP BY m.id) AS s
               WHERE s.dur > 60) t
         WHERE t.rn IN ((t.n + 1) / 2, (t.n + 2) / 2)`
    )?.value ?? null;
  }

  /** Медианная длительность игры в секундах: от предыдущей игры (или начала
   *  матча) до конца игры; игры короче минуты не учитываются. */
  getMedianGameSeconds(current_only: boolean, tournamentId?: number) {
    return this.db.get<{value: number}>(
        `SELECT avg(t.game_dur) AS value
         FROM (SELECT s.game_dur,
                      ROW_NUMBER() OVER (ORDER BY s.game_dur) AS rn,
                      COUNT(*) OVER ()                        AS n
               FROM (SELECT CAST(strftime('%s', g.created_at) AS INTEGER) -
                      CAST(strftime('%s', COALESCE((SELECT max(g2.created_at) FROM game g2
                                                    WHERE g2.match_id = m.id
                                                      AND g2.created_at < g.created_at), m.created_at)) AS INTEGER) AS game_dur
               FROM match m
                        JOIN game g ON g.match_id = m.id
               WHERE m.finished = 1
                 ${current_only ? `AND m.tournament_id = ${tournamentId ?? '(SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)'}` : ''}) s
               WHERE s.game_dur > 60) t
         WHERE t.rn IN ((t.n + 1) / 2, (t.n + 2) / 2)`
    )?.value ?? null;
  }

  /** Среднее число игр в матче — показатель выводится как float
   *  (та же выборка, что у getMedianSecondsPerPoint). */
  getAverageGamesPerMatch(current_only: boolean, tournamentId?: number) {
    return this.db.get<{value: number}>(
        `SELECT avg(s.cnt) AS value
         FROM (SELECT m.id                                                                        AS match_id,
                      count(g.id)                                                                 AS cnt,
                      CAST(strftime('%s', (SELECT max(created_at) FROM game WHERE match_id = m.id)) AS INTEGER) -
                      CAST(strftime('%s', m.created_at) AS INTEGER)                               AS dur
               FROM match m
                        JOIN game g ON g.match_id = m.id
               WHERE m.finished = 1
                 ${current_only ? `AND m.tournament_id = ${tournamentId ?? '(SELECT t.id FROM tournament t WHERE t.current = 1 AND t.available = 1)'}` : ''}
               GROUP BY m.id) AS s
         WHERE s.dur > 60`
    )?.value ?? null;
  }

  getById(id: number) {
    return this.db.get(
        `SELECT *
         FROM match
         WHERE id = ?`,
        [id]
    );
  }

  create(user_1_id: number, user_2_id: number, user_3_id: number, user_4_id: number) {
    return this.db.run(
        `INSERT INTO match (tournament_id,
                            user_1_id,
                            user_2_id,
                            user_3_id,
                            user_4_id,
                            court_id)
         VALUES ((SELECT id FROM tournament WHERE current = 1),
                 ?,
                 ?,
                 ?,
                 ?,
                 (SELECT c.id FROM court c JOIN tournament t ON c.tournament_id = t.id WHERE t.current = 1 AND c.available = 1 ORDER BY c.id ASC LIMIT 1))`,
        [user_1_id, user_2_id, user_3_id, user_4_id]
    );
  }

  deleteById(id: number) {
    return this.db.run(
        `DELETE
         FROM match
         WHERE id = ?`,
        [id]
    );
  }
}

export default Match;