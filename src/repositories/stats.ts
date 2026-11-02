import Repository from './common.ts';
import DB from "../db.ts";
import SettingsRepository from './settings.ts';

const settingsRepository = new SettingsRepository();
const db = new Repository().db;

/** Значение настройки турнира с фолбэком на defaults (как в SettingsRepository.get). */
const settingFor = (tournamentId: number, name: string): string | null =>
    settingsRepository.get(name, tournamentId)?.value ?? null;

/** Список id турниров scope: тот же тип, те же wins и game_point. */
const scopeIds = (tournamentId: number): number[] => {
  const type = db.get<{ tournament_type_id: number }>(
      `SELECT tournament_type_id FROM tournament WHERE id = ?`, [tournamentId],
  )?.tournament_type_id;
  if (type === undefined) return [];
  const wins = settingFor(tournamentId, 'wins');
  const gamePoint = settingFor(tournamentId, 'game_point');
  const same = (name: string, value: string | null) => `
    coalesce((SELECT s.value FROM tournament_settings s JOIN defaults d ON d.id = s.defaults_id
              WHERE s.tournament_id = t.id AND d.name = '${name}'),
             (SELECT value FROM defaults WHERE name = '${name}')) = '${(value ?? '').replaceAll("'", "''")}'`;
  return db.all<{ id: number }>(
      `SELECT t.id FROM tournament t
       WHERE t.tournament_type_id = ? AND t.available = 1 AND ${same('wins', wins)} AND ${same('game_point', gamePoint)}`,
      [type],
  ).map(r => r.id);
};

const inList = (ids: number[]) => `(${ids.length ? ids.join(', ') : '-1'})`;

class Stats {
  declare static _instance: Stats | undefined;
  db!: DB;

  constructor() {
    if (Stats._instance) {
      return Stats._instance;
    }
    Stats._instance = this;

    this.db = new Repository().db;
  }

  /** Города: уникальные city_id участников (архив не считается). */
  cities(tournamentId: number): { current: number; all: number } {
    const current = this.db.get<{ c: number }>(
        `SELECT count(DISTINCT u.city_id) AS c
         FROM tournament_user tu JOIN user u ON u.id = tu.user_id
         WHERE tu.tournament_id = ? AND tu.archived = 0`, [tournamentId])?.c ?? 0;
    const all = this.db.get<{ c: number }>(
        `SELECT count(DISTINCT u.city_id) AS c
         FROM tournament_user tu JOIN user u ON u.id = tu.user_id
         WHERE tu.tournament_id IN ${inList(scopeIds(tournamentId))} AND tu.archived = 0`)?.c ?? 0;
    return {current, all};
  }

  /** Участники: в турнире и уникальные по scope. */
  participants(tournamentId: number): { current: number; all: number } {
    const current = this.db.get<{ c: number }>(
        `SELECT count(*) AS c FROM tournament_user
         WHERE tournament_id = ? AND archived = 0`, [tournamentId])?.c ?? 0;
    const all = this.db.get<{ c: number }>(
        `SELECT count(DISTINCT tu.user_id) AS c FROM tournament_user tu
         WHERE tu.tournament_id IN ${inList(scopeIds(tournamentId))} AND tu.archived = 0`)?.c ?? 0;
    return {current, all};
  }

  /** Средний рейтинг двоек (user_lab.rating_2) участников; без рейтинга — не учитывается. */
  avgRating(tournamentId: number): { current: number | null; all: number | null } {
    const current = this.db.get<{ v: number | null }>(
        `SELECT avg(ul.rating_2) AS v
         FROM tournament_user tu JOIN user_lab ul ON ul.user_id = tu.user_id
         WHERE tu.tournament_id = ? AND tu.archived = 0`, [tournamentId])?.v ?? null;
    const all = this.db.get<{ v: number | null }>(
        `SELECT avg(ul.rating_2) AS v FROM user_lab ul
         WHERE ul.user_id IN (SELECT DISTINCT tu.user_id FROM tournament_user tu
                              WHERE tu.tournament_id IN ${inList(scopeIds(tournamentId))} AND tu.archived = 0)`)?.v ?? null;
    return {current, all};
  }

  /** Новички: участники, для которых этот турнир — первый турнир того же типа. */
  newcomers(tournamentId: number): { current: number; all: number } {
    const notFirst = `
        NOT EXISTS (
          SELECT 1 FROM tournament_user tu2
                   JOIN tournament t2 ON t2.id = tu2.tournament_id
          WHERE tu2.user_id = tu.user_id
            AND t2.available = 1
            AND t2.tournament_type_id = (SELECT tournament_type_id FROM tournament WHERE id = ?)
            AND (t2.started_at < t.started_at
                 OR (t2.started_at = t.started_at AND t2.id < t.id)))`;
    const current = this.db.get<{ c: number }>(
        `SELECT count(*) AS c FROM tournament_user tu JOIN tournament t ON t.id = tu.tournament_id
         WHERE tu.tournament_id = ? AND tu.archived = 0 AND ${notFirst}`,
        [tournamentId, tournamentId])?.c ?? 0;
    const ids = scopeIds(tournamentId);
    const all = this.db.get<{ c: number }>(
        `SELECT count(*) AS c FROM tournament_user tu JOIN tournament t ON t.id = tu.tournament_id
         WHERE tu.tournament_id IN ${inList(ids)} AND tu.archived = 0 AND ${notFirst}`,
        [tournamentId])?.c ?? 0;
    return {current, all};
  }

  /** Игры и завершённые матчи: в турнире и в scope. */
  games(tournamentId: number): { current: number; all: number } {
    const current = this.db.get<{ c: number }>(
        `SELECT count(g.id) AS c FROM game g JOIN match m ON m.id = g.match_id
         WHERE m.tournament_id = ?`, [tournamentId])?.c ?? 0;
    const all = this.db.get<{ c: number }>(
        `SELECT count(g.id) AS c FROM game g JOIN match m ON m.id = g.match_id
         WHERE m.tournament_id IN ${inList(scopeIds(tournamentId))}`)?.c ?? 0;
    return {current, all};
  }

  matches(tournamentId: number): { current: number; all: number } {
    const current = this.db.get<{ c: number }>(
        `SELECT count(*) AS c FROM match WHERE tournament_id = ? AND finished = 1`, [tournamentId])?.c ?? 0;
    const all = this.db.get<{ c: number }>(
        `SELECT count(*) AS c FROM match
         WHERE tournament_id IN ${inList(scopeIds(tournamentId))} AND finished = 1`)?.c ?? 0;
    return {current, all};
  }

  /** Длительности игр (от предыдущей игры или начала матча) и матчей
   *  в завершённых матчах дольше минуты — та же методика, что у медиан. */
  longestGameSeconds(tournamentId: number): { current: number | null; all: number | null } {
    const rows = (scope: string, params: unknown[] = []) => this.db.get<{ v: number | null }>(
        `SELECT max(s.game_dur) AS v FROM (
           SELECT CAST(strftime('%s', g.created_at) AS INTEGER) -
                  CAST(strftime('%s', coalesce((SELECT max(g2.created_at) FROM game g2
                                                WHERE g2.match_id = m.id AND g2.created_at < g.created_at),
                                               m.created_at)) AS INTEGER) AS game_dur
           FROM match m JOIN game g ON g.match_id = m.id
           WHERE m.finished = 1 AND ${scope}) s
         WHERE s.game_dur > 60`, params)?.v ?? null;
    return {
      current: rows('m.tournament_id = ?', [tournamentId]),
      all: rows(`m.tournament_id IN ${inList(scopeIds(tournamentId))}`),
    };
  }

  longestMatchSeconds(tournamentId: number): { current: number | null; all: number | null } {
    const current = this.db.get<{ v: number | null }>(
        `SELECT max(s.dur) AS v FROM (
           SELECT CAST(strftime('%s', (SELECT max(created_at) FROM game WHERE match_id = m.id)) AS INTEGER) -
                  CAST(strftime('%s', m.created_at) AS INTEGER) AS dur
           FROM match m WHERE m.finished = 1 AND m.tournament_id = ?) s
         WHERE s.dur > 60`, [tournamentId])?.v ?? null;
    const all = this.db.get<{ v: number | null }>(
        `SELECT max(s.dur) AS v FROM (
           SELECT CAST(strftime('%s', (SELECT max(created_at) FROM game WHERE match_id = m.id)) AS INTEGER) -
                  CAST(strftime('%s', m.created_at) AS INTEGER) AS dur
           FROM match m WHERE m.finished = 1
             AND m.tournament_id IN ${inList(scopeIds(tournamentId))}) s
         WHERE s.dur > 60`)?.v ?? null;
    return {current, all};
  }

  /** Среднее число игр в матче по scope (те же wins и game_point). */
  avgGamesPerMatchAll(tournamentId: number): number | null {
    return this.db.get<{ v: number | null }>(
        `SELECT avg(s.cnt) AS v FROM (
           SELECT m.id, count(g.id) AS cnt,
                  CAST(strftime('%s', (SELECT max(created_at) FROM game WHERE match_id = m.id)) AS INTEGER) -
                  CAST(strftime('%s', m.created_at) AS INTEGER) AS dur
           FROM match m JOIN game g ON g.match_id = m.id
           WHERE m.finished = 1 AND m.tournament_id IN ${inList(scopeIds(tournamentId))}
           GROUP BY m.id) s
         WHERE s.dur > 60`)?.v ?? null;
  }

  /** Дельта рейтинга: топ прироста и падения. Турнир — суммы по игрокам
   *  турнира; scope — лучшая/худшая сумма одного игрока в одном турнире. */
  ratingDelta(tournamentId: number): { riseCurrent: number | null; fallCurrent: number | null; riseAll: number | null; fallAll: number | null } {
    const current = this.db.get<{ rise: number | null; fall: number | null }>(
        `SELECT max(s.d) AS rise, min(s.d) AS fall FROM (
           SELECT r.user_id, sum(r.delta) AS d
           FROM rating r JOIN match m ON m.id = r.match_id
           WHERE m.finished = 1 AND m.tournament_id = ?
           GROUP BY r.user_id) s`, [tournamentId]) ?? {};
    const all = this.db.get<{ rise: number | null; fall: number | null }>(
        `SELECT max(s.d) AS rise, min(s.d) AS fall FROM (
           SELECT r.user_id, sum(r.delta) AS d
           FROM rating r JOIN match m ON m.id = r.match_id
           WHERE m.finished = 1 AND m.tournament_id IN ${inList(scopeIds(tournamentId))}
           GROUP BY r.user_id, m.tournament_id) s`) ?? {};
    return {
      riseCurrent: current.rise ?? null, fallCurrent: current.fall ?? null,
      riseAll: all.rise ?? null, fallAll: all.fall ?? null,
    };
  }

  /** Топ винрейта (процентов, округлённый) среди участников с матчами:
   *  турнир — матчи турнира, scope — матчи турниров scope. */
  topWinrate(tournamentId: number): { current: number | null; all: number | null } {
    const wins = Number(settingFor(tournamentId, 'wins') ?? 2);
    const top = (scope: string) => this.db.get<{ v: number | null }>(
        `SELECT max(u.v) AS v FROM (
           SELECT round(100.0 * sum(w.won) / count(*)) AS v FROM (
             SELECT u.id AS uid,
                    CASE WHEN u.id IN (m.user_1_id, m.user_2_id)
                         THEN count(g.lost_2_by) >= ${wins}
                         ELSE count(g.lost_1_by) >= ${wins} END AS won
             FROM match m
                      JOIN game g ON g.match_id = m.id
                      CROSS JOIN user u
             WHERE m.finished = 1 AND ${scope}
               AND u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
             GROUP BY m.id, u.id) w
           GROUP BY w.uid) u`);
    return {
      current: top(`m.tournament_id = ${Number(tournamentId)}`)?.v ?? null,
      all: top(`m.tournament_id IN ${inList(scopeIds(tournamentId))}`)?.v ?? null,
    };
  }

  /** Повторные пары: пары, игравшие вместе не впервые.
   *  Турнир — пары турнира с совместным матчем раньше первого совместного
   *  матча внутри турнира; scope — пары с более чем одним совместным
   *  матчем в рамках scope. */
  repeatPairs(tournamentId: number): { current: number; all: number } {
    const pairs = (scope: string) => this.db.all<{ tid: number; chron: string; a: number; b: number; a2: number; b2: number }>(
        `SELECT m.tournament_id AS tid,
                coalesce((SELECT max(g.created_at) FROM game g WHERE g.match_id = m.id), m.created_at) AS chron,
                min(m.user_1_id, m.user_2_id) AS a, max(m.user_1_id, m.user_2_id) AS b,
                min(m.user_3_id, m.user_4_id) AS a2, max(m.user_3_id, m.user_4_id) AS b2
         FROM match m WHERE m.finished = 1 AND ${scope}`)
        .flatMap(r => [{a: r.a, b: r.b, tid: r.tid, chron: r.chron}, {a: r.a2, b: r.b2, tid: r.tid, chron: r.chron}]);
    const currentPairs = pairs(`m.tournament_id = ${Number(tournamentId)}`);
    // первый совместный матч каждой пары внутри турнира
    const firstInTournament = new Map<string, string>();
    for (const p of currentPairs) {
      const key = `${p.a}-${p.b}`;
      const min = firstInTournament.get(key);
      if (min === undefined || p.chron < min) firstInTournament.set(key, p.chron);
    }
    const allPairs = pairs(`m.tournament_id IN ${inList(scopeIds(tournamentId))}`);
    // пара повторная, если был совместный матч раньше первого внутри турнира
    const current = [...firstInTournament.entries()].filter(([key, first]) =>
        allPairs.some(p => `${p.a}-${p.b}` === key && p.chron < first),
    ).length;
    const counts = new Map<string, number>();
    for (const p of allPairs) counts.set(`${p.a}-${p.b}`, (counts.get(`${p.a}-${p.b}`) ?? 0) + 1);
    const all = [...counts.values()].filter(c => c > 1).length;
    return {current, all};
  }

  /** Как быстро набивается capacity: секунды от первой регистрации до той,
   *  которой закрылся capacity; «—» если не набран или времени нет. */
  capacityFillSeconds(tournamentId: number): { current: number | null; all: number | null } {
    const fill = (tid: number): number | null => {
      const capacity = Number(settingFor(tid, 'capacity') ?? 0);
      if (!capacity) return null;
      const rows = this.db.all<{ created_at: string }>(
          `SELECT created_at FROM tournament_user
           WHERE tournament_id = ? AND created_at IS NOT NULL ORDER BY created_at, id`, [tid]);
      if (rows.length < capacity) return null;
      return (Date.parse(rows[capacity - 1].created_at + 'Z') - Date.parse(rows[0].created_at + 'Z')) / 1000;
    };
    const current = fill(tournamentId);
    const values = scopeIds(tournamentId).map(fill).filter((v): v is number => v !== null);
    const all = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return {current, all};
  }
}

export default Stats;
