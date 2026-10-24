import type { CalculatedPair, ReadyRow } from "../repositories/common.ts";
import Repository from "../repositories/common.ts";
import UserRepository from "../repositories/user.ts";
import SettingsService from "./settings.ts";
const settingsService = new SettingsService();
import CourtService from "./court.ts";
const courtService = new CourtService();
import ReadyPriorityService from "./ready-priority.ts";
const readyPriorityService = new ReadyPriorityService();
import {buildCandidates, fitThreeGameModel, optimize} from "./pairing.ts";
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
   * Формирует пары для матчей на всех доступных кортах — раунд целиком.
   *
   * Кандидаты фильтруются настройками DELTA, PROC и FIFTY (семантика
   * прежнего посортового calcReadyRec), после чего оптимизатор
   * (src/services/pairing.ts) собирает набор непересекающихся матчей:
   * жадный старт по PRIORITY и локальный поиск, минимизирующий агрегаты
   * полей PRIORITY по всему раунду. Универсальный тай-брейк — суммарная
   * ожидаемая конкурентность (вероятность матча в три игры), предсказанная
   * логистической моделью по истории турнира: разница средних рейтингов
   * команд и разброс рейтингов внутри пар.
   *
   * При включённой delta_auto дельта сужается/расширяется на 15% в
   * зависимости от доли матчей в три игры среди последних 20 завершённых
   * матчей турнира (меньше 30% — сузить, больше 45% — расширить).
   * @returns Массив рассчитанных пар — до одного матча на доступный корт
   * (пустой, если доступных кортов нет или кандидатов нет).
   */
  ready = async (tournamentId?: number): Promise<CalculatedPair[]> => {
    const availableCourts = await courtService.countAvailable(tournamentId);
    if (availableCourts === 0) {
      return [];
    }
    const rawDelta = Number(settingsService.get(settingsService.opt.DELTA, tournamentId));
    const delta = await this.effectiveDelta(rawDelta, tournamentId);
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

    const readyRows = await this.repository.ready([], tournamentId) as ReadyRow[];
    if (readyRows.length < 4) {
      return [];
    }
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

    // повторные встречи: составы последних 10 завершённых матчей турнира
    const WINDOW = 10;
    const recent = await this.repository.recentFinished(tournamentId, WINDOW);
    const duoKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const quadKey = (ids: number[]) => [...ids].sort((x, y) => x - y).join("-");
    const recentDuos = new Set<string>();
    const recentQuads = new Set<string>();
    for (const m of recent) {
      const ids = [m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id];
      recentQuads.add(quadKey(ids));
      recentDuos.add(duoKey(ids[0], ids[1]));
      recentDuos.add(duoKey(ids[2], ids[3]));
    }

    // модель конкурентности: история «разница рейтингов → три игры?»
    const wins = Number(settingsService.get(settingsService.opt.WINS, tournamentId)) || 2;
    const history = await this.repository.threeGameHistory(tournamentId);
    const samples = history.map((h) => ({
      avgDiff: Math.abs((h.p1 + h.p2) / 2 - (h.p3 + h.p4) / 2),
      spread: Math.max(Math.abs(h.p1 - h.p2), Math.abs(h.p3 - h.p4)),
      threeGames: h.lost_1 === wins - 1 || h.lost_2 === wins - 1 ? 1 : 0,
    }));
    const model = fitThreeGameModel(samples);

    const candidates = buildCandidates(readyRows, buddies, recentDuos, recentQuads,
        {delta, proc, fifty, model, priority});
    const pairs = optimize(candidates, priority, availableCourts);
    console.log(
      `Selected ${pairs.length} pairs:\n${JSON.stringify(pairs, null, 2)}`,
    );
    return pairs;
  };

  /**
   * Эффективная дельта подбора: при выключенной delta_auto — сама дельта.
   * При включённой — сдвиг на ±15% от доли матчей в три игры среди
   * последних 20 завершённых матчей турнира: меньше 30% — матчи слишком
   * односторонние, дельта сужается; больше 45% — расширяется.
   * Результат ограничен диапазоном [10, 300].
   */
  private async effectiveDelta(rawDelta: number, tournamentId?: number): Promise<number> {
    if (settingsService.get(settingsService.opt.DELTA_AUTO, tournamentId) !== "1") {
      return rawDelta;
    }
    const wins = Number(settingsService.get(settingsService.opt.WINS, tournamentId)) || 2;
    const history = await this.repository.threeGameHistory(tournamentId);
    const recent = history.slice(-20);
    if (recent.length === 0) {
      return rawDelta;
    }
    const threeGames = recent.filter((h) =>
        h.lost_1 === wins - 1 || h.lost_2 === wins - 1).length;
    const share = threeGames / recent.length;
    let delta = rawDelta;
    if (share < 0.3) {
      delta = Math.ceil(rawDelta * 0.85);
    } else if (share > 0.45) {
      delta = Math.floor(rawDelta * 1.15);
    }
    return Math.min(300, Math.max(10, delta));
  };
}

export default Common;
