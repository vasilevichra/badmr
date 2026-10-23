import type { CalculatedPair, ReadyRow } from "../repositories/common.ts";
import Repository from "../repositories/common.ts";
import UserRepository from "../repositories/user.ts";
import SettingsService from "./settings.ts";
const settingsService = new SettingsService();
import CourtService from "./court.ts";
const courtService = new CourtService();
import ReadyPriorityService from "./ready-priority.ts";
const readyPriorityService = new ReadyPriorityService();
import type { Request } from "express";

/**
 * Система 50%: фаворит по моментуму должен играть «вверх или на равных».
 * Фаворит пары — большее число выигравших последний матч игроков; при
 * равенстве — больший процент выигранных матчей на турнире (количество
 * побед несправедливо при разном числе сыгранных матчей; при равенстве
 * обоих показателей матчап нейтрален). Матчап правильный, если сумма
 * рейтингов фаворита не больше суммы рейтингов соперников. Возвращаются
 * только правильные матчапы; если таких нет — исходный список
 * (настройка игнорируется, чтобы не блокировать подбор вовсе).
 */
const filterFifty = (candidates: CalculatedPair[]): CalculatedPair[] => {
  const winsLast = (p: ReadyRow[]) =>
    p.reduce((n, x) => n + (x.won === 1 ? 1 : 0), 0);
  // сравнение винрейтов перекрёстным умножением — без деления и его
  // погрешностей; пара без сыгранных матчей имеет винрейт 0
  const winsMore = (p: ReadyRow[], q: ReadyRow[]) => {
    const wins1 = p[0].wins + p[1].wins;
    const wins2 = q[0].wins + q[1].wins;
    const matches1 = p[0].matches + p[1].matches;
    const matches2 = q[0].matches + q[1].matches;
    return wins1 * matches2 > wins2 * matches1;
  };
  const sum = (p: ReadyRow[]) => p[0].rating + p[1].rating;
  // фаворит матчапа по моментуму: 1 — players1, 2 — players2,
  // 0 — нейтральный матчап (исходы последних матчей и винрейты равны)
  const favoriteOf = ({ players1, players2 }: CalculatedPair): 0 | 1 | 2 => {
    const wl1 = winsLast(players1 as ReadyRow[]);
    const wl2 = winsLast(players2 as ReadyRow[]);
    if (wl1 !== wl2) {
      return wl1 > wl2 ? 1 : 2;
    }
    if (winsMore(players1 as ReadyRow[], players2 as ReadyRow[])) {
      return 1;
    }
    if (winsMore(players2 as ReadyRow[], players1 as ReadyRow[])) {
      return 2;
    }
    return 0;
  };
  const correct = (pair: CalculatedPair) => {
    const fav = favoriteOf(pair);
    return fav === 0 ||
      (fav === 1
        ? sum(pair.players1 as ReadyRow[]) <= sum(pair.players2 as ReadyRow[])
        : sum(pair.players2 as ReadyRow[]) <= sum(pair.players1 as ReadyRow[]));
  };
  const filtered = candidates.filter(correct);
  const result = filtered.length > 0 ? filtered : candidates;
  // помечаем фаворита каждой возвращённой пары — в том числе в fallback,
  // где матчап может быть «неправильным», но фаворит по моментуму тот же
  for (const pair of result) {
    pair.favorite = favoriteOf(pair);
  }
  return result;
};

class Common {
  declare static _instance: Common | undefined;
  repository!: Repository;
  userRepository!: UserRepository;

  /**
   * Создаёт singleton-экземпляр. Повторные вызовы конструктора
   * возвращают существующий экземпляр вместо создания нового.
   */
  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.repository = new Repository();
    this.userRepository = new UserRepository();
  }

  /**
   * Определяет тип устройства клиента по заголовку User-Agent.
   * @param req Express-запрос с применённым middleware `express-useragent`.
   * @returns "phone" для мобильных User-Agent, иначе "desktop".
   */
  device = (req: Request) => {
    const useragent = (req as Request & { useragent?: { isMobile?: boolean } })
      .useragent;
    if (useragent?.isMobile) {
      return "phone";
    } else {
      return "desktop";
    }
  };

  /**
   * Формирует пары для матчей на всех доступных кортах. Для каждого корта
   * рассчитывает лучший вариант пар через {@link Common.calcReadyRec}
   * с учётом настроек DELTA, PROC и PRIORITY.
   * @returns Массив рассчитанных пар, по одной на каждый доступный корт
   * (пустой, если доступных кортов нет).
   */
  ready = async (tournamentId?: number): Promise<CalculatedPair[]> => {
    let available_courts = await courtService.countAvailable(tournamentId);
    if (available_courts === 0) {
      return [];
    }
    const delta = Number(settingsService.get(settingsService.opt.DELTA, tournamentId));
    // Система 50%: фаворит по последним матчам подбирает соперников
    // не слабее себя
    const fifty = settingsService.get(settingsService.opt.FIFTY, tournamentId) === "1";
    // максимальный процент превышения среднего рейтинга пары одним из
    // игроков; 0 — не ограничивает
    const proc = Number(settingsService.get(settingsService.opt.PROC, tournamentId));
    // настройка priority хранит id из ready_priority ('1,2,3') — переводим
    // их в имена полей; порядок значений задаёт приоритет отбора пар:
    // первое значение — высший приоритет
    const priorityMap = new Map<number, string>(
      (await readyPriorityService.select()).map((r) => [Number(r.id), String(r.text)]),
    );
    const priority = String(settingsService.get(settingsService.opt.PRIORITY, tournamentId))
      .split(",")
      .map((id) => priorityMap.get(Number(id)))
      .filter((field): field is string => Boolean(field));

    const calculated_objects: CalculatedPair[][] = [];
    while (available_courts-- > 0) {
      calculated_objects.push(
        await this.calcReadyRec(delta, proc, priority, calculated_objects, fifty, tournamentId),
      );
    }

    const pairs = calculated_objects.flat(1);
    console.log(
      `Selected ${pairs.length} pairs:\n${JSON.stringify(pairs, null, 2)}`,
    );
    return pairs;
  };

  /**
   * Рассчитывает один лучший матч для одного корта. Берёт всех готовых
   * игроков, составляет все возможные пары и объединяет их в матчи
   * «пара против пары» с разницей сумм рейтингов в пределах `delta`,
   * исключая игроков, уже занятых ранее рассчитанными матчами. Пара
   * Также пара отклоняется, если один из её игроков превышает средний
   * рейтинг пары более чем на `proc` процентов. Среди кандидатов матч
   * выбирается последовательной минимизацией полей из `priority`: высший
   * приоритет у первого значения настройки PRIORITY, далее по убыванию;
   * при равенстве всех полей побеждает первый по перечислению кандидат.
   * @param delta Максимальная допустимая разница сумм рейтингов двух пар.
   * @param proc Максимальный допустимый процент превышения среднего рейтинга
   * пары одним из её игроков; 0 отключает проверку.
   * @param priority Имена полей отбора в порядке убывания приоритета:
   * "played" — предпочитаются ещё не игравшие в предыдущем матче,
   * "matches" — с минимальным числом сыгранных матчей на турнире,
   * "diff" — с минимальной разницей сумм рейтингов пар,
   * "friends" — с максимальным совместным винрейтом напарников; пустой
   * список — кандидаты не ранжируются.
   * @param calculated_objects Матчи, уже рассчитанные для других кортов.
   * @param fifty Система 50%: матчапы, где пара-фаворит играет вниз,
   * отфильтровываются до применения приоритетов; если подходящих нет,
   * настройка игнорируется.
   * @param tournamentId Турнир выборки готовых игроков; undefined — текущий.
   * @returns Единственный лучший матч или пустой массив, если
   * подходящего матча нет.
   */
  async calcReadyRec(
    delta: number,
    proc: number,
    priority: string[],
    calculated_objects: CalculatedPair[][],
    fifty: boolean,
    tournamentId?: number,
  ): Promise<CalculatedPair[]> {
    const ready = await this.repository.ready(calculated_objects, tournamentId);
    const readyRows = ready as ReadyRow[];    const byId = new Map(readyRows.map((u) => [u.user_id, u]));
    // «Шанс» пары — винрейт совместных доигранных матчей напарников:
    // getBuddiesById каждого готового игрока (сырой win_rate числом).
    // Нужен и для показа колонки «Шанс» в «Подборе» (chance1/chance2),
    // и для friends-приоритета; вместе не игравшие в списке отсутствуют
    const buddies = new Map<number, Map<number, number>>();
    for (const row of readyRows) {
      const partnerRates = new Map<number, number>();
      for (const b of await this.userRepository.getBuddiesById(row.user_id)) {
        partnerRates.set(b.user_id, b.win_rate);
      }
      buddies.set(row.user_id, partnerRates);
    }
    const chance = (id1: number, id2: number): number | null =>
      buddies.get(id1)?.get(id2) ?? null;
    const keys: number[][] = [];
    const sums: number[] = [];
    for (let i = 0; i < readyRows.length; i++) {
      for (let j = i + 1; j < readyRows.length; j++) {
        keys.push([readyRows[i].user_id, readyRows[j].user_id]);
        sums.push(readyRows[i].rating + readyRows[j].rating);
      }
    }
    const pairsRatingDiff: CalculatedPair[] = [];
    // пара отклоняется, если один из игроков превышает средний рейтинг
    // пары более чем на proc процентов; proc=0 — настройка игнорируется
    const exceeds = (r1: number, r2: number) =>
      proc > 0 && Math.max(r1, r2) > ((r1 + r2) / 2) * (1 + proc / 100);
    // Каждая комбинация двух пар рассматривается один раз (b > a): это
    // заменяет прежний перебор всех упорядоченных пар с отсевом обратного
    // дубликата через глубокое сравнение — результат идентичен, а сложность
    // падает с O(pairs^2 * candidates) до O(pairs^2).
    for (let a = 0; a < keys.length; a++) {
      const i_key = keys[a];
      const i_value = sums[a];
      for (let b = a + 1; b < keys.length; b++) {
        const j_key = keys[b];
        if (
          i_key[0] === j_key[0] ||
          i_key[0] === j_key[1] ||
          i_key[1] === j_key[0] ||
          i_key[1] === j_key[1]
        ) {
          continue;
        }
        const diff = Math.abs(i_value - sums[b]);
        if (diff > delta) {
          continue;
        }
        const readyPlayer11 = byId.get(i_key[0]);
        const readyPlayer12 = byId.get(i_key[1]);
        const readyPlayer21 = byId.get(j_key[0]);
        const readyPlayer22 = byId.get(j_key[1]);
        if (
          !readyPlayer11 ||
          !readyPlayer12 ||
          !readyPlayer21 ||
          !readyPlayer22
        ) {
          continue;
        }
        if (
          exceeds(readyPlayer11.rating, readyPlayer12.rating) ||
          exceeds(readyPlayer21.rating, readyPlayer22.rating)
        ) {
          continue;
        }
        const chance1 = chance(i_key[0], i_key[1]);
        const chance2 = chance(j_key[0], j_key[1]);
        pairsRatingDiff.push({
          players1: [readyPlayer11, readyPlayer12],
          players2: [readyPlayer21, readyPlayer22],
          diff: diff,
          matches:
            readyPlayer11.matches +
            readyPlayer12.matches +
            readyPlayer21.matches +
            readyPlayer22.matches,
          played:
            readyPlayer11.played +
            readyPlayer12.played +
            readyPlayer21.played +
            readyPlayer22.played,
          chance1,
          chance2,
          friends: (chance1 ?? 0) + (chance2 ?? 0),
        });
      }
    }
    const pairsRatingDiff_2 = fifty ? filterFifty(pairsRatingDiff) : pairsRatingDiff;
    if (pairsRatingDiff_2.length === 0) {
      return [] as CalculatedPair[];
    } else {
      // приоритеты применяются последовательно: сначала отбор по полю
      // с высшим приоритетом (первым в настройке priority), при равенстве —
      // по следующему; при равенстве всех полей побеждает кандидат,
      // встретившийся при переборе первым. friends — единственное поле,
      // где предпочтение отдаётся большему значению (чем выше совместный
      // винрейт напарников, тем выше шанс выиграть)
      const field = (candidate: CalculatedPair, name: string) =>
        Number((candidate as unknown as Record<string, unknown>)[name]);
      const best = pairsRatingDiff_2
        .map((candidate, index) => ({candidate, index}))
        .sort((a, b) => {
          for (const name of priority) {
            const d = field(a.candidate, name) - field(b.candidate, name);
            if (d !== 0) {
              return name === "friends" ? -d : d;
            }
          }
          return a.index - b.index;
        })[0].candidate;
      return [best];
    }
  }
}

export default Common;
