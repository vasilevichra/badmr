import Match110 from '../repositories/match110.ts';
import Game110 from '../repositories/game110.ts';
import Tournament from '../repositories/tournament.ts';
import Group from '../repositories/group.ts';
import SettingsService from './settings.ts';
import StandingsService from './standings.ts';
import { structure, readySlot, type SlotRef, type BracketStructure } from './bracket-structure.ts';

const settingsService = new SettingsService();
const match110 = new Match110();
const game110 = new Game110();
const tournament = new Tournament();
const group = new Group();
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

  /** Посев: seed k = k-я команда по strengthOrder (1 — сильнейшая). */
  private seedToTeam(tournamentId: number): Map<number, number> {
    return new Map(this.participants(tournamentId).map((team_id, i) => [i + 1, team_id]));
  }

  /** Участники сетки в порядке сеяния. System 1 — все команды по силе;
   *  system 2 — топ-2 каждого котла по standings: первые места котлов
   *  подряд (сеяния 1..m), затем вторые — классическое сеяние, при котором
   *  первые места одного котла расходятся по половинам сетки. */
  private participants(tournamentId: number): number[] {
    const system = Number(settingsService.get('tournament_system', tournamentId));
    if (system !== 2) {
      return match110.strengthOrder(tournamentId).map(row => row.team_id);
    }
    const firsts: number[] = [];
    const seconds: number[] = [];
    for (const pocket of group.pockets(tournamentId)) {
      const top = standingsService.standings(tournamentId, pocket.group_id).slice(0, 2);
      if (top[0]) firsts.push(top[0].team_id);
      if (top[1]) seconds.push(top[1].team_id);
    }
    return [...firsts, ...seconds];
  }

  private buildStructure(tournamentId: number): BracketStructure {
    const teamCount = this.participants(tournamentId).length;
    const depth = Number(settingsService.get('consolation_depth', tournamentId));
    return structure(teamCount, depth);
  }

  async generate(tournamentId?: number): Promise<void> {
    const id = tournamentId ?? tournament.getCurrent()!.id;
    const t = tournament.getById(id)!;
    if (t.tournament_status_id !== 2) {
      throw badRequest('сетка генерируется только для идущего турнира');
    }
    const system = Number(settingsService.get('tournament_system', id));
    if (system !== 1 && system !== 2) {
      throw badRequest('олимпийская сетка доступна для систем 1 и 2');
    }
    if (match110.hasSlotted(id)) {
      throw badRequest('сетка уже сгенерирована');
    }
    if (system === 2 && match110.hasUnfinishedGroup(id)) {
      throw badRequest('групповой этап не завершён');
    }
    if (system === 2 && this.participants(id).length < 2) {
      throw badRequest('для плей-офф нужно минимум две команды в котлах');
    }
    const s = this.buildStructure(id);
    const teamBySeed = this.seedToTeam(id);
    for (const slot of s.slots.filter(x => x.stage === 'upper' && x.round === 1)) {
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
    if (!match || match.stage === null || match.stage === 'group') {
      return; // матричный (или групповой) матч в роутинге сетки не участвует
    }
    const s = this.buildStructure(match.tournament_id);
    const from: SlotRef = { stage: match.stage, round: match.round!, pos: match.pos! };
    for (const slot of s.slots) {
      if (slot.feeders?.some(f => f.stage === from.stage && f.round === from.round && f.pos === from.pos)) {
        this.createIfReady(s, match.tournament_id, { stage: slot.stage, round: slot.round, pos: slot.pos });
      }
    }
  }

  private createIfReady(s: BracketStructure, tournamentId: number, target: SlotRef): void {
    if (match110.getBySlot(tournamentId, target)) {
      return; // слот уже сматчен — идемпотентность
    }
    const teams = readySlot(s, target, feeder => {
      const m = match110.getBySlot(tournamentId, feeder);
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

  /** Состояние сетки для клиента: структура + матчи слотов (счёт —
   *  последняя игра матча). Без сгенерированной сетки — generated: false. */
  bracket110(tournamentId?: number) {
    const id = tournamentId ?? tournament.getCurrent()!.id;
    const system = Number(settingsService.get('tournament_system', id));
    if (!match110.hasSlotted(id)) {
      return {generated: false as const, system};
    }
    const structure = this.buildStructure(id);
    const depth = Number(settingsService.get('consolation_depth', id));
    const matches = match110.getAllSlotted(id).map(m => {
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
    return {generated: true, system, depth, structure, matches};
  }
}

export default Bracket;
