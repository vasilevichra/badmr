import type { CalculatedPair, ReadyRow } from "../repositories/common.ts";

/**
 * Глобальный подбор пар на все корты раунда.
 *
 * Кандидаты — все допустимые матчи «пара против пары» (фильтры delta, proc,
 * fifty — как прежде). Раунд собирается целиком: жадный старт и локальный
 * поиск (замена матча, перегруппировка двух матчей, добавление матча),
 * минимизирующий агрегаты полей PRIORITY по всему набору выбранных матчей.
 * Детерминирован: никакой случайности, равные варианты разрешаются порядком
 * перечисления кандидатов.
 */

/** Исторический матч для модели конкурентности. */
export interface MatchSample {
  /** |разница средних рейтингов команд до матча| */
  avgDiff: number;
  /** максимальный разброс рейтингов внутри пар */
  spread: number;
  /** 1 — матч закончился в три игры (счёт 2:1), 0 — в две */
  threeGames: number;
}

/**
 * Логистическая модель вероятности «матч в три игры»:
 * P = σ(a − b1·avgDiff/10 − b2·spread/100).
 * Дефолт (мало истории): равные команды без разброса дают P=0.5,
 * разница 30 → ≈0.29, разброс 100 внутри пары −≈0.07.
 */
export interface ThreeGameModel {
  a: number;
  b1: number;
  b2: number;
}

const DEFAULT_MODEL: ThreeGameModel = {a: 0, b1: 0.3, b2: 0.3};

/** Нижняя граница выборки для подгонки модели по истории турнира. */
const MIN_SAMPLES = 20;

/**
 * Подгоняет модель по истории матчей градиентным спуском (бинарная
 * кросс-энтропия). Детерминировано: фикс. число итераций, старт из дефолта.
 * Коэффициенты ограничены снизу малыми положительными: данные не должны
 * перевернуть зависимость (больше разница — меньше трёхигровых матчей).
 */
export const fitThreeGameModel = (samples: MatchSample[]): ThreeGameModel => {
  if (samples.length < MIN_SAMPLES) {
    return {...DEFAULT_MODEL};
  }
  const model: ThreeGameModel = {...DEFAULT_MODEL};
  const lr = 0.3;
  for (let iter = 0; iter < 400; iter++) {
    let ga = 0, g1 = 0, g2 = 0;
    for (const s of samples) {
      const x1 = s.avgDiff / 10;
      const x2 = s.spread / 100;
      const p = predict(model, s.avgDiff, s.spread);
      const err = p - s.threeGames;
      ga += err;
      g1 += err * x1;
      g2 += err * x2;
    }
    const n = samples.length;
    // dL/da = (p - y), dL/db = -(p - y)·x (z = a − b1·x1 − b2·x2):
    // спуск по градиенту меняет знаки обновлений b1/b2 на противоположные
    model.a -= lr * ga / n;
    model.b1 += lr * g1 / n;
    model.b2 += lr * g2 / n;
  }
  model.b1 = Math.min(5, Math.max(0.02, model.b1));
  model.b2 = Math.min(5, Math.max(0.02, model.b2));
  return model;
};

/** P(матч в три игры) по модели. */
export const threeGameProb = (model: ThreeGameModel, avgDiff: number, spread: number): number =>
    predict(model, avgDiff, spread);

const predict = (m: ThreeGameModel, avgDiff: number, spread: number): number => {
  const z = m.a - m.b1 * (avgDiff / 10) - m.b2 * (spread / 100);
  return 1 / (1 + Math.exp(-z));
};

/** Кандидат матча: CalculatedPair + служебные поля оптимизатора. */
export interface Candidate {
  pair: CalculatedPair;
  /** 4 id игроков */
  ids: number[];
  /** сумма-разница команд (поле priority diff, ограничение delta) */
  diff: number;
  matches: number;
  played: number;
  friends: number;
  /** повторные встречи (меньше — лучше) */
  rematch: number;
  /** предсказанная вероятность трёх игр (больше — лучше) */
  balance: number;
  /** сигнатура для детерминированных тай-брейков */
  sig: string;
}

/** Направление сортировки полей priority: 1 — минимизировать, −1 — максимизировать. */
const FIELD_DIR: Record<string, 1 | -1> = {
  played: 1,
  matches: 1,
  diff: 1,
  friends: -1,
  rematch: 1,
  balance: -1,
};

const fieldValue = (c: Candidate, name: string): number =>
    Number((c as unknown as Record<string, unknown>)[name] ?? 0);

/**
 * Строит всех допустимых кандидатов раунда.
 * @param readyRows готовые игроки (репозиторий ready)
 * @param buddies совместные винрейты напарников: user_id → (напарник → %)
 * @param recentDuos ключи дуо недавних матчей ("min-max")
 * @param recentQuads ключи составов недавних матчей
 * @param opts delta (макс. сумма-разница), proc, fifty, модель конкурентности,
 *        priority — имена полей (rematch/balance попадают в пары только когда
 *        участвуют в отборе, чтобы не менять форму ответа без нужды)
 */
export const buildCandidates = (
    readyRows: ReadyRow[],
    buddies: Map<number, Map<number, number>>,
    recentDuos: Set<string>,
    recentQuads: Set<string>,
    opts: {delta: number; proc: number; fifty: boolean; model: ThreeGameModel; priority: string[]},
): Candidate[] => {
  const {delta, proc, fifty, model, priority} = opts;
  const byId = new Map(readyRows.map((u) => [u.user_id, u]));
  const chance = (id1: number, id2: number): number | null =>
      buddies.get(id1)?.get(id2) ?? null;
  const exceeds = (r1: number, r2: number) =>
      proc > 0 && Math.max(r1, r2) > ((r1 + r2) / 2) * (1 + proc / 100);
  const duoKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const quadKey = (ids: number[]) => [...ids].sort((x, y) => x - y).join("-");

  // фаворит по моментуму (система 50%)
  const winsLast = (p: ReadyRow[]) => p.reduce((n, x) => n + (x.won === 1 ? 1 : 0), 0);
  const winsMore = (p: ReadyRow[], q: ReadyRow[]) => {
    const wins1 = p[0].wins + p[1].wins;
    const wins2 = q[0].wins + q[1].wins;
    const matches1 = p[0].matches + p[1].matches;
    const matches2 = q[0].matches + q[1].matches;
    return wins1 * matches2 > wins2 * matches1;
  };
  const sum = (p: ReadyRow[]) => p[0].rating + p[1].rating;
  const favoriteOf = (p1: ReadyRow[], p2: ReadyRow[]): 0 | 1 | 2 => {
    const wl1 = winsLast(p1), wl2 = winsLast(p2);
    if (wl1 !== wl2) return wl1 > wl2 ? 1 : 2;
    if (winsMore(p1, p2)) return 1;
    if (winsMore(p2, p1)) return 2;
    return 0;
  };

  // все пары готовых игроков
  const keys: number[][] = [];
  const sums: number[] = [];
  for (let i = 0; i < readyRows.length; i++) {
    for (let j = i + 1; j < readyRows.length; j++) {
      keys.push([readyRows[i].user_id, readyRows[j].user_id]);
      sums.push(readyRows[i].rating + readyRows[j].rating);
    }
  }

  const candidates: Candidate[] = [];
  for (let a = 0; a < keys.length; a++) {
    const [i1, i2] = keys[a];
    const row1 = byId.get(i1)!, row2 = byId.get(i2)!;
    if (exceeds(row1.rating, row2.rating)) continue;
    for (let b = a + 1; b < keys.length; b++) {
      const [j1, j2] = keys[b];
      if (i1 === j1 || i1 === j2 || i2 === j1 || i2 === j2) continue;
      const diff = Math.abs(sums[a] - sums[b]);
      if (diff > delta) continue;
      const row3 = byId.get(j1)!, row4 = byId.get(j2)!;
      if (exceeds(row3.rating, row4.rating)) continue;

      const teams = [[row1, row2], [row3, row4]];
      const favorite = favoriteOf(teams[0], teams[1]);

      const chance1 = chance(i1, i2);
      const chance2 = chance(j1, j2);
      const ids = [i1, i2, j1, j2];
      const spread = Math.max(
          Math.abs(row1.rating - row2.rating),
          Math.abs(row3.rating - row4.rating),
      );
      const rematch =
          (recentDuos.has(duoKey(i1, i2)) ? 1 : 0) +
          (recentDuos.has(duoKey(j1, j2)) ? 1 : 0) +
          (recentQuads.has(quadKey(ids)) ? 1 : 0);

      const pair: CalculatedPair = {
        players1: [row1, row2],
        players2: [row3, row4],
        diff,
        matches: row1.matches + row2.matches + row3.matches + row4.matches,
        played: row1.played + row2.played + row3.played + row4.played,
        chance1,
        chance2,
        friends: (chance1 ?? 0) + (chance2 ?? 0),
      };
      // favorite проставляется только при включённой системе 50%,
      // rematch/balance — только когда участвуют в приоритете отбора:
      // форма ответа «Подбора» меняется только там, где поле задействовано
      if (fifty) {
        pair.favorite = favorite;
      }
      if (priority.includes("rematch")) {
        pair.rematch = rematch;
      }
      if (priority.includes("balance")) {
        pair.balance = threeGameProb(model, diff / 2, spread);
      }

      candidates.push({
        pair,
        ids,
        diff,
        matches: row1.matches + row2.matches + row3.matches + row4.matches,
        played: row1.played + row2.played + row3.played + row4.played,
        friends: (chance1 ?? 0) + (chance2 ?? 0),
        rematch,
        balance: threeGameProb(model, diff / 2, spread),
        sig: quadKey(ids),
      });
    }
  }
  // система 50%: фаворит играет «вверх или на равных»; матчапы, где
  // фаворит играет вниз, отфильтровываются; если правильных матчапов нет —
  // настройка игнорируется (fallback прежнего фильтра), фаворит остаётся
  // помеченным во всех возвращённых парах
  if (fifty) {
    const correct = candidates.filter((c) => {
      const fav = c.pair.favorite!;
      if (fav === 0) return true;
      const s1 = (c.pair.players1 as ReadyRow[]).reduce((n, p) => n + p.rating, 0);
      const s2 = (c.pair.players2 as ReadyRow[]).reduce((n, p) => n + p.rating, 0);
      return fav === 1 ? s1 <= s2 : s2 <= s1;
    });
    if (correct.length > 0) {
      return correct;
    }
  }
  return candidates;
};

/** Лексикографическое сравнение ключей решений: меньше — лучше. */
const lexLess = (x: (string | number)[], y: (string | number)[]): boolean => {
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return x[i] < y[i]!;
  }
  return false;
};

/** Агрегированный ключ решения: [−число матчей, ...поля priority, сигнатуры]. */
const solutionKeys = (solution: Candidate[], priority: string[]): (string | number)[] => {
  const keys: (string | number)[] = [-solution.length];
  for (const name of priority) {
    const dir = FIELD_DIR[name] ?? 1;
    keys.push(dir * solution.reduce((s, c) => s + fieldValue(c, name), 0));
  }
  // сигнатуры отсортированы: симметричные перестановки матчей между кортами
  // дают равные ключи — локальный поиск не «дёргает» эквивалентные решения
  keys.push(...solution.map((c) => c.sig).sort());
  return keys;
};

/** Пер-матчевое сравнение для жадного выбора (семантика прежнего calcReadyRec). */
const matchLess = (x: Candidate, y: Candidate, priority: string[]): boolean => {
  for (const name of priority) {
    const dir = FIELD_DIR[name] ?? 1;
    const d = (fieldValue(x, name) - fieldValue(y, name)) * dir;
    if (d !== 0) return d < 0;
  }
  // при равенстве всех полей побеждает первый по перечислению кандидат
  return false;
};

const disjoint = (c: Candidate, solution: Candidate[]): boolean =>
    solution.every((m) => m.ids.every((id) => !c.ids.includes(id)));

/**
 * Собирает раунд: до maxMatches непересекающихся матчей.
 * Жадный старт + локальный поиск (замена матча, перегруппировка пары
 * матчей, добавление матча) до локального оптимума агрегатов priority.
 */
export const optimize = (
    candidates: Candidate[],
    priority: string[],
    maxMatches: number,
): CalculatedPair[] => {
  if (candidates.length === 0 || maxMatches <= 0) return [];

  // жадный старт — как прежний посортовой подбор
  const solution: Candidate[] = [];
  for (let court = 0; court < maxMatches; court++) {
    let best: Candidate | undefined;
    for (const c of candidates) {
      if (!disjoint(c, solution) || solution.includes(c)) continue;
      if (!best || matchLess(c, best, priority)) best = c;
    }
    if (!best) break;
    solution.push(best);
  }

  const better = (trial: Candidate[]): boolean =>
      lexLess(solutionKeys(trial, priority), solutionKeys(solution, priority));

  let improved = true;
  for (let guard = 0; improved && guard < 100; guard++) {
    improved = false;

    // добавление матча, если корты ещё есть
    if (solution.length < maxMatches) {
      for (const c of candidates) {
        if (!disjoint(c, solution)) continue;
        solution.push(c);
        improved = true;
        break;
      }
    }
    if (improved) continue;

    // замена одного матча на альтернативный
    outer:
    for (let i = 0; i < solution.length; i++) {
      const rest = solution.filter((_, idx) => idx !== i);
      for (const c of candidates) {
        if (c === solution[i] || !disjoint(c, rest)) continue;
        const trial = [...rest.slice(0, i), c, ...rest.slice(i)];
        if (better(trial)) {
          solution.splice(0, solution.length, ...trial);
          improved = true;
          break outer;
        }
      }
    }
    if (improved) continue;

    // перегруппировка пары выбранных матчей: все разбиения их 8 игроков
    outer2:
    for (let i = 0; i < solution.length; i++) {
      for (let j = i + 1; j < solution.length; j++) {
        const eight = new Set([...solution[i].ids, ...solution[j].ids]);
        const local = candidates.filter((c) => c.ids.every((id) => eight.has(id)));
        const current = [solution[i], solution[j]];
        for (let a = 0; a < local.length; a++) {
          for (let b = a + 1; b < local.length; b++) {
            if (!disjoint(local[b], [local[a]])) continue;
            const trial = [local[a], local[b]];
            if (lexLess(solutionKeys(trial, priority), solutionKeys(current, priority))) {
              solution.splice(i, 1, trial[0]);
              solution.splice(j, 1, trial[1]);
              improved = true;
              break outer2;
            }
          }
        }
      }
    }
  }

  return solution.map((c) => c.pair);
};
