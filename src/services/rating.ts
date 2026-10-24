import RatingRepository from '../repositories/rating.ts';
import SettingsService from './settings.ts';
import type { SqliteParam } from '../db.ts';

const settingsService = new SettingsService();

/** Состояние цепочки рейтинга игрока (аналог последней строки rating в триггере). */
interface UserState {
  /** previous + delta последней строки, уже округлённый до 0.1 */
  prev: number;
  stale: number | null;
  series: number | null;
  /** created_at матча последней строки; у сида — null */
  date: string | null;
}

/** Снапшот строки матча из БД. */
interface MatchRow {
  id: number;
  user_1_id: number;
  user_2_id: number;
  user_3_id: number;
  user_4_id: number;
  created_at: string;
  finished: number;
}

/** Источник каскадного пересчёта: изменённый матч или снапшот удалённого. */
interface RecalcSource {
  matchId: number;
  /** участники изменённого матча */
  userIds: number[];
  /** хронологический ключ изменённого матча */
  chron: string;
  /** false при пересчёте после удаления матча: сам он уже не пересчитывается */
  includeSelf: boolean;
}

/** Затронутый матч в порядке пересчёта. */
interface AffectedMatch {
  id: number;
  user_1_id: number;
  user_2_id: number;
  user_3_id: number;
  user_4_id: number;
  created_at: string;
  chron: string;
  finished: number;
}

/** Вычисленная строка рейтинга. */
interface ComputedRow {
  userId: number;
  previous: number;
  delta: number;
  stale: number;
  series: number;
}

/** SQLite round(x, 1): половина — от нуля (Math.round(-2.5) даёт -2). */
const round1 = (v: number): number => Math.sign(v) * Math.round(Math.abs(v) * 10) / 10;

/** SQLite julianday('YYYY-MM-DD HH:MM:SS') — строка трактуется как UTC. */
const julianday = (dt: string | null): number | null => {
  if (!dt) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(dt);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) / 86400000 + 2440587.5;
};

class Rating {
  declare static _instance: Rating | undefined;
  rating!: RatingRepository;

  constructor() {
    if (Rating._instance) {
      return Rating._instance;
    }
    Rating._instance = this;

    this.rating = new RatingRepository();
  }

  getByUserId = (user_id: number) => this.rating.getByUserId(user_id);

  /** Параметры формулы дельты — единые с триггером
   *  calculate_rating_when_match_finished (миграция 04). */
  private formulaParams() {
    return {
      wins: Number(settingsService.get('wins')),
      limit: Number(settingsService.get('rating_diff_limit')),
      k: Number(settingsService.get('rating_diff_divisor')),
      c: Number(settingsService.get('calibration_matches')),
      boost: Number(settingsService.get('calibration_boost')),
      cap: Number(settingsService.get('calibration_cap')),
      fresh: Number(settingsService.get('calibration_fresh_days')),
    };
  }

  /** Снапшот изменённого матча для каскада — снимать ДО удаления матча. */
  getRecalcSource(matchId: number): RecalcSource | undefined {
    const match = this.rating.getById<MatchRow>(matchId);
    if (!match) return undefined;
    return {
      matchId,
      userIds: [match.user_1_id, match.user_2_id, match.user_3_id, match.user_4_id],
      chron: this.rating.getChronKey(matchId),
      includeSelf: true,
    };
  }

  /** Ставит каскадный пересчёт в фон (после HTTP-ответа): node:sqlite
   *  синхронный, «фоном» здесь означает выполнение через setImmediate. */
  scheduleRecalc(source: RecalcSource): void {
    setImmediate(() => {
      try {
        this.recalc(source);
      } catch (error) {
        console.error('[rating-recalc] ошибка пересчёта рейтинга:', error);
      }
    });
  }

  /** Пересчёт по изменённому матчу (фон после изменения игры/матча). */
  scheduleRecalcFromMatch(matchId: number): void {
    const source = this.getRecalcSource(matchId);
    if (source) this.scheduleRecalc(source);
  }

  /** Пересчёт после удаления матча: снапшот снимается до удаления. */
  scheduleRecalcAfterMatchDelete(matchId: number): void {
    const source = this.getRecalcSource(matchId);
    if (!source) return;
    source.includeSelf = false;
    this.scheduleRecalc(source);
  }

  /** Синхронный каскадный пересчёт (используется тестами напрямую). */
  recalc(source: RecalcSource): void {
    const p = this.formulaParams();

    // затронутые матчи: фикс-поинт по участникам — все завершённые матчи
    // любого из затронутых игроков позже изменённого (по хронологии).
    // Участники расширяются итеративно: дельты нового матча влияют на
    // рейтинги его игроков в следующих матчах.
    const users = new Set<number>(source.userIds);
    const affected = new Map<number, AffectedMatch>();
    if (source.includeSelf) {
      const start = this.rating.getById<MatchRow>(source.matchId)!;
      affected.set(source.matchId, {
        id: start.id,
        user_1_id: start.user_1_id,
        user_2_id: start.user_2_id,
        user_3_id: start.user_3_id,
        user_4_id: start.user_4_id,
        created_at: start.created_at,
        chron: source.chron,
        finished: Number(start.finished),
      });
    }
    for (;;) {
      const rows = this.rating.getLaterFinishedMatches([...users], source.chron, source.matchId);
      const freshRows = rows.filter((r) => !affected.has(r.id));
      if (freshRows.length === 0) break;
      for (const r of freshRows) {
        affected.set(r.id, {...r, finished: 1});
        users.add(r.user_1_id);
        users.add(r.user_2_id);
        users.add(r.user_3_id);
        users.add(r.user_4_id);
      }
    }
    if (affected.size === 0) return;

    // обработка в хронологическом порядке — previous каждого матча считается
    // от уже пересчитанных предыдущих
    const ordered = [...affected.values()].sort((a, b) =>
        a.chron.localeCompare(b.chron) || a.id - b.id
    );
    const ids = ordered.map((m) => m.id);

    // игры затронутых матчей одним запросом: счёт команд
    const games = this.rating.getGamesByMatchIds(ids);
    const lostByMatch = new Map<number, { lost_1: number; lost_2: number }>();
    for (const g of games) {
      const acc = lostByMatch.get(g.match_id) ?? {lost_1: 0, lost_2: 0};
      if (g.lost_1_by !== null) acc.lost_1++;
      if (g.lost_2_by !== null) acc.lost_2++;
      lostByMatch.set(g.match_id, acc);
    }

    // состояние игроков на момент первого затронутого матча:
    // последняя строка рейтинга вне затронутых матчей
    const state = new Map<number, UserState>();
    for (const u of users) {
      const last = this.rating.getLastRatingExcludingMatchIds(u, ids);
      state.set(u, last
          ? {
            prev: round1(Number(last.previous) + Number(last.delta ?? 0)),
            stale: last.stale === null ? null : Number(last.stale),
            series: last.series === null ? null : Number(last.series),
            date: last.date ?? null,
          }
          : {prev: 0, stale: null, series: null, date: null});
    }

    // вычисление новых строк: формулы повторяют calculate_rating_when_match_finished
    const computed = new Map<number, ComputedRow[]>();
    const flagUpdates: SqliteParam[][] = []; // изменение finished изменённого матча
    let unFinished = false;

    for (const m of ordered) {
      const lost = lostByMatch.get(m.id) ?? {lost_1: 0, lost_2: 0};
      const finished = lost.lost_1 === p.wins || lost.lost_2 === p.wins;

      if (m.id === source.matchId && finished !== Boolean(m.finished)) {
        flagUpdates.push([`UPDATE match SET finished = ? WHERE id = ?`, finished ? 1 : 0, m.id]);
        if (!finished) unFinished = true;
      }
      if (!finished) continue; // строки рейтинга не пишутся, каскад продолжается

      const userIds = [m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id];
      const prevState = userIds.map((u) => state.get(u)!);
      const ps = prevState.map((st) => st.prev);

      // калибровка: серия стартует при отсутствии рейтинга, сиде (даты нет)
      // или протухшей последней строке
      const jNew = julianday(m.created_at);
      const evolved = prevState.map((st) => {
        const jPrev = julianday(st.date);
        const expired = jNew !== null && jPrev !== null && jNew - jPrev > p.fresh;
        return {
          stale: st.stale === null || st.date === null || expired ? 1 : st.stale,
          series: st.stale === null || st.date === null || expired ? 1 : (st.series ?? 0) + 1,
        };
      });

      const avg12 = (ps[0] + ps[1]) / 2;
      const avg34 = (ps[2] + ps[3]) / 2;
      const diff12 = avg12 - avg34; // на столько команда 1/2 сильнее
      const diff34 = avg34 - avg12;
      const win34Delta = diff34 >= p.limit ? 0 : round1((p.limit - diff34) / p.k);
      const lose12Delta = diff34 >= p.limit ? 0 : round1((p.limit - diff34) / -p.k);
      const win12Delta = diff12 >= p.limit ? 0 : round1((p.limit - diff12) / p.k);
      const lose34Delta = diff12 >= p.limit ? 0 : round1((p.limit - diff12) / -p.k);

      const team_1_lost = lost.lost_1 === p.wins;
      const rows = userIds.map((userId, i) => {
        const stale = evolved[i].stale;
        const series = evolved[i].series;
        // множитель затухает линейно от boost до 1 в течение серии калибровки
        const calibrated = stale === 1 && series <= p.c && p.c > 0;
        const mult = calibrated ? 1 + (p.boost - 1) * (p.c - series + 1) / p.c : 1;
        const base = i < 2
            ? (team_1_lost ? lose12Delta : win12Delta)
            : (team_1_lost ? win34Delta : lose34Delta);
        const scaled = base * mult;
        const delta = calibrated && p.cap > 0
            ? round1(Math.min(p.cap, Math.max(-p.cap, scaled)))
            : round1(scaled);
        return {userId, previous: round1(ps[i]), delta, stale, series};
      });

      computed.set(m.id, rows);

      // перенос состояния цепочки
      rows.forEach((r, i) => {
        state.set(userIds[i], {prev: r.previous + r.delta, stale: r.stale, series: r.series, date: m.created_at});
      });
    }

    // no-op: существующие строки совпадают с вычисленными — не переписываем
    const existingRows = this.rating.getRowsByMatchIds(ids);
    const existing = new Map<number, Map<number, { previous: number; delta: number | null; stale: number | null; series: number | null }>>();
    for (const r of existingRows) {
      const byUser = existing.get(r.match_id) ?? new Map<number, { previous: number; delta: number | null; stale: number | null; series: number | null }>();
      byUser.set(r.user_id, {previous: r.previous, delta: r.delta, stale: r.stale, series: r.series});
      existing.set(r.match_id, byUser);
    }
    let changed = flagUpdates.length > 0;
    if (!changed) {
      for (const [matchId, rows] of computed) {
        const byUser = existing.get(matchId);
        if (!byUser || byUser.size !== rows.length) {
          changed = true;
          break;
        }
        for (const r of rows) {
          const old = byUser.get(r.userId);
          if (!old || old.previous !== r.previous || old.delta !== r.delta
              || old.stale !== r.stale || old.series !== r.series) {
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    if (!changed) return;

    const statements: SqliteParam[][] = [...flagUpdates];
    if (unFinished) {
      // зеркально enable_resources_when_match_finished: освободить корт и участников
      statements.push(...this.rating.releaseResourceStatements(source.matchId));
    }
    for (const id of ids) {
      statements.push([`DELETE FROM rating WHERE match_id = ?`, id]);
    }
    for (const [matchId, rows] of computed) {
      for (const r of rows) {
        statements.push(
            [`INSERT INTO rating (user_id, match_id, previous, delta, stale, series) VALUES (?, ?, ?, ?, ?, ?)`,
              r.userId, matchId, r.previous, r.delta, r.stale, r.series]
        );
      }
    }
    this.rating.apply(statements);
  }
}

export default Rating;
