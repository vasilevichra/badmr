import Match110 from '../repositories/match110.ts';
import Game110 from '../repositories/game110.ts';
import Tournament from '../repositories/tournament.ts';
import BasketService from './basket.ts';
import StandingsService from './standings.ts';
import { structure, readySlot, type SlotRef, type BracketStructure } from './bracket-structure.ts';

const basketService = new BasketService();
const match110 = new Match110();
const game110 = new Game110();
const tournament = new Tournament();
const standingsService = new StandingsService();

const badRequest = (message: string): Error =>
  Object.assign(new Error(message), { status: 400 });

/** Генерация олимпийской сетки 110 и ленивый роутинг матчей.
 *
 *  Инварианты:
 *  - структура — чистая функция (bracket-structure.ts); матч создаётся
 *    лениво: seed-пары раунда 1 при generate, остальные — когда оба
 *    питателя целевого слота отдали по команде (onMatchFinished);
 *  - слот создаётся один раз: наличие матча в слоте — гейт повторного
 *    создания (идемпотентность роутинга и generate);
 *  - bye-команда попадает в следующий раунд как сид целевого слота
 *    (round=0 в feeders), матч с её участием создаётся сразу после
 *    завершения второго питателя. */
class Bracket {
  declare static _instance: Bracket | undefined;
  constructor() {
    if (Bracket._instance) {
      return Bracket._instance;
    }
    Bracket._instance = this;
  }

  /** Посев: seed k = k-я команда по participants (1 — сильнейшая). */
  private seedToTeam(tournamentId: number, groupId: number): Map<number, number> {
    return new Map(this.participants(tournamentId, groupId).map((team_id, i) => [i + 1, team_id]));
  }

  /** Участники сетки котла в порядке сеяния. С групповым этапом —
   *  топ-2 каждой корзины: первые места корзин подряд (сеяния 1..m),
   *  затем вторые — классическое сеяние, при котором первые одной
   *  корзины расходятся по половинам сетки. Без группового этапа —
   *  все команды котла по силе. */
  private participants(tournamentId: number, groupId: number): number[] {
    if (basketService.groupStage(tournamentId, groupId)) {
      const firsts: number[] = [];
      const seconds: number[] = [];
      const basketMap = basketService.baskets(groupId);
      const maxBasket = Math.max(0, ...[...basketMap.values()].filter((b): b is number => b !== null));
      for (let n = 1; n <= maxBasket; n++) {
        const top = standingsService.standings(tournamentId, groupId, n).slice(0, 2);
        if (top[0]) firsts.push(top[0].team_id);
        if (top[1]) seconds.push(top[1].team_id);
      }
      return [...firsts, ...seconds];
    }
    return match110.strengthOrder(tournamentId, groupId).map(row => row.team_id);
  }

  private buildStructure(tournamentId: number, groupId: number): BracketStructure {
    // доигровки — всегда полная рекурсия: все места уточняются
    return structure(this.participants(tournamentId, groupId).length, 0);
  }

  async generate(tournamentId: number | undefined, groupId: number): Promise<void> {
    const id = tournamentId ?? tournament.getCurrent()!.id;
    const t = tournament.getById(id)!;
    if (t.tournament_status_id !== 2) {
      throw badRequest('сетка генерируется только для идущего турнира');
    }
    if (basketService.orgSystem(id, groupId) !== 1) {
      throw badRequest('круговая система сетки не имеет');
    }
    if (match110.hasSlotted(id, groupId)) {
      throw badRequest('сетка уже сгенерирована');
    }
    if (basketService.groupStage(id, groupId)) {
      if (match110.hasUnfinishedGroup(id, groupId)) {
        throw badRequest('групповой этап не завершён');
      }
      if (this.participants(id, groupId).length < 2) {
        throw badRequest('для плей-офф нужно минимум две команды в корзинах');
      }
    }
    const s = this.buildStructure(id, groupId);
    const teamBySeed = this.seedToTeam(id, groupId);
    // сразу создаются матчи, у которых обе команды известны без игр:
    // сеяные пары раунда 1 и слоты с двумя bye-питателями (сиды 2..n,
    // прошедшие раунд 1 без матча — их иначе никто не триггернет)
    const readyBySeeds = s.slots.filter(x =>
      x.stage === 'upper'
      && (x.feeders === null || x.feeders.every(f => f.round === 0)));
    for (const slot of readyBySeeds) {
      if (slot.seeds[0] <= 0 || slot.seeds[1] <= 0) {
        continue; // bye-пара: матч не создаётся
      }
      const team1 = teamBySeed.get(slot.seeds[0])!;
      const team2 = teamBySeed.get(slot.seeds[1])!;
      const result = match110.create(team1, team2, id, slot);
      game110.create(result.id);
    }
  }

  /** Роутинг после завершения матча сетки: создаёт все слоты, у которых
   *  данный — один из питателей (матчи R2+ и все уровни карманов —
   *  и upper-, и lower-матчи кормят следующие слоты). Идемпотентно. */
  onMatchFinished(match110Id: number): void {
    const match = match110.getById(match110Id);
    if (!match || match.stage === null || match.stage === 'group' || match.group_id === null) {
      return; // матричный (или групповой) матч в роутинге сетки не участвует
    }
    const s = this.buildStructure(match.tournament_id, match.group_id);
    const from: SlotRef = { stage: match.stage, round: match.round!, pos: match.pos! };
    for (const slot of s.slots) {
      if (slot.feeders?.some(f => f.stage === from.stage && f.round === from.round && f.pos === from.pos)) {
        this.createIfReady(s, match.tournament_id, match.group_id, { stage: slot.stage, round: slot.round, pos: slot.pos });
      }
    }
  }

  private createIfReady(s: BracketStructure, tournamentId: number, groupId: number, target: SlotRef): void {
    if (match110.getBySlot(tournamentId, groupId, target)) {
      return; // слот уже сматчен — идемпотентность
    }
    const teams = readySlot(s, target, feeder => {
      const m = match110.getBySlot(tournamentId, groupId, feeder);
      if (!m || m.finished !== 1) {
        return [null, null];
      }
      const w = this.winnerOf(m);
      if (w === null) {
        return [null, null];
      }
      return [w, w === m.team_1_id ? m.team_2_id : m.team_1_id];
    });
    if (!teams) {
      return; // питатели ещё не готовы
    }
    const result = match110.create(teams[0], teams[1], tournamentId, target);
    game110.create(result.id);
  }

  /** Победитель завершённого матча 110: тот, чей счёт больше (110 против <110). */
  private winnerOf(match: { id: number; team_1_id: number; team_2_id: number }): number | null {
    const scores = game110.scoresByMatchId(match.id);
    if (!scores) {
      return null;
    }
    return scores.score_1 > scores.score_2 ? match.team_1_id : match.team_2_id;
  }

  /** Состояние сетки котла для клиента: структура + матчи слотов (счёт —
   *  последняя игра матча). Без сгенерированной сетки — generated: false. */
  bracket110(tournamentId: number | undefined, groupId: number) {
    const id = tournamentId ?? tournament.getCurrent()!.id;
    if (!match110.hasSlotted(id, groupId)) {
      return {generated: false as const};
    }
    const structure = this.buildStructure(id, groupId);
    const matches = match110.getAllSlotted(id, groupId).map(m => {
      const scores = game110.scoresByMatchId(m.id);
      return {
        slot: {stage: m.stage, round: m.round, pos: m.pos} as SlotRef,
        id: m.id,
        team_1_id: m.team_1_id,
        team_2_id: m.team_2_id,
        score_1: scores?.score_1 ?? 0,
        score_2: scores?.score_2 ?? 0,
        finished: m.finished,
        // текущая игра незавершённого матча — модалка табло на странице
        game_id: m.finished === 0 ? game110.currentGameId(m.id) ?? null : null
      };
    });
    return {generated: true, structure, matches};
  }
}

export default Bracket;
