import GameRepository from '../repositories/game.ts';
import Game110Repository from '../repositories/game110.ts';
import Match110Repository from '../repositories/match110.ts';
import MatchRepository from '../repositories/match.ts';
import BracketService from './bracket.ts';
import RatingService from './rating.ts';
import SettingsService from './settings.ts';
import NotifyService from './notify.ts';

const ratingService = new RatingService();
const matchRepository = new MatchRepository();
const match110Repository = new Match110Repository();
const bracketService = new BracketService();
const settingsService = new SettingsService();
const notifyService = new NotifyService();

class Game {
  declare static _instance: Game | undefined;
  game!: GameRepository;
  game110!: Game110Repository;

  constructor() {
    if (Game._instance) {
      return Game._instance;
    }
    Game._instance = this;

    this.game = new GameRepository();
    this.game110 = new Game110Repository();
  }

  getById = (id: number) => this.game.getById(id);
  getCurrentByTeamIds = (teamId1: number, teamId2: number, tournamentId?: number) => this.game110.getCurrentByTeamIds(teamId1, teamId2, tournamentId);
  getResults = (tournamentId?: number) => this.game110.getResults(tournamentId);
  /** Очко 110 + роутинг сетки: после завершения матча (finished=1)
   *  прокидываем победителя/проигравшего в целевые слоты. Вызов
   *  идемпотентен (слот создаётся один раз), поэтому срабатывает и при
   *  повторных очках по уже завершённому матчу. Матричные матчи
   *  (stage IS NULL) роутинг пропускает внутри сервиса. */
  increaseCurrentByTeamIds = (teamId1: number, teamId2: number, teamNumber: string, tournamentId?: number) => {
    // игру берём ДО очка: после финиша матча getCurrentByTeamIds пуст
    // (фильтр finished = 0), а нам нужен match_110_id для роутинга
    const game = this.game110.getCurrentByTeamIds(teamId1, teamId2, tournamentId);
    const board = this.game110.increaseCurrentByTeamIds(teamId1, teamId2, teamNumber, tournamentId);
    if (game) {
      const match = match110Repository.getById(game.match_110_id);
      if (match?.finished === 1) {
        bracketService.onMatchFinished(match.id);
        // уведомление о результате: гейт тот же — «game существовал до очка,
        // матч теперь finished»; на следующих очках game уже пуст
        void notifyService.matchFinished110(match.id);
      }
    }
    return board;
  };
  decreaseCurrentByTeamIds = (teamId1: number, teamId2: number, teamNumber: string, tournamentId?: number) => this.game110.decreaseCurrentByTeamIds(teamId1, teamId2, teamNumber, tournamentId);
  /** Подача на 0:0 — тап/двойной клик судьи по чётному игроку пары. */
  setCurrentServeByTeamIds = (teamId1: number, teamId2: number, userId: number, tournamentId?: number) => this.game110.setCurrentServeByTeamIds(teamId1, teamId2, userId, tournamentId);
  /** Свап чётности пары судьёй — только на границе партии. */
  swapCurrentEvenByTeamIds = (teamId1: number, teamId2: number, teamNumber: string, tournamentId?: number) => this.game110.swapCurrentEvenByTeamIds(teamId1, teamId2, teamNumber, tournamentId);
  /** Смена разряда табло — из колбэка ответа increase (порядок гарантирован). */
  setTypePosByTeamIds = (teamId1: number, teamId2: number, typePos: number, tournamentId?: number) => this.game110.setTypePosByTeamIds(teamId1, teamId2, typePos, tournamentId);

  /** Живое табло Новой лиги: текущая игра матча (может быть null —
   *  табло показывает 0:0, игра создаётся первым очком). */
  getCurrentByMatchId = (matchId: number) => this.game.getCurrentByMatchId(matchId);

  /** Очко обычного матча: при переходе матча в finished (match_over
   *  возвращается только на самом переходе — повторные очки гейтит
   *  репозиторий) — уведомление о результате. */
  increaseCurrentByMatchId = async (matchId: number, teamNumber: string) => {
    const result = await this.game.increaseCurrentByMatchId(
        matchId,
        teamNumber,
        Number(settingsService.get('game_point')),
        Number(settingsService.get('max_point'))
    );
    if (result?.match_over) {
      void notifyService.matchFinished(matchId);
    }
    return result;
  };

  decreaseCurrentByMatchId = (matchId: number, teamNumber: string) => this.game.decreaseCurrentByMatchId(matchId, teamNumber);

  /** Двойной клик судьи по игроку на 0:0 — задать первого подающего матча. */
  setCurrentServeByMatchId = (matchId: number, userId: number) => this.game.setCurrentServeByMatchId(matchId, userId);

  /** Свайп судьи по игроку — ручной свап чётности кортов пары. */
  swapCurrentEvenByMatchId = (matchId: number, teamNumber: string) => this.game.swapCurrentEvenByMatchId(matchId, teamNumber);

  create = (match_id: number, lost_1_by: string | null, lost_2_by: string | null, created_at: string) => {
    const result = this.game.create(match_id, lost_1_by, lost_2_by, created_at);
    // каскадный пересчёт рейтинга этого и последующих матчей — в фоне
    ratingService.scheduleRecalcFromMatch(match_id);
    return result;
  };

  update = (id: number, lost_1_by: string | null, lost_2_by: string | null) => {
    const result = this.game.update(id, lost_1_by, lost_2_by);
    const game = this.game.getById(id);
    if (game) ratingService.scheduleRecalcFromMatch(Number(game.match_id));
    return result;
  };

  deleteById = (id: number) => {
    const game = this.game.getById(id);
    const result = this.game.deleteById(id);
    if (game) ratingService.scheduleRecalcFromMatch(Number(game.match_id));
    return result;
  };

  /** Счёт выигравшей пары по правилам бадминтона (те же CASE-выражения,
   *  что в getMeanSecondsPerPoint): до game_point−2 — game_point,
   *  до max_point−2 — lost+2, дальше — max_point. */
  private winPoints(lost: number): number {
    const gamePoint = Number(settingsService.get('game_point'));
    const maxPoint = Number(settingsService.get('max_point'));
    return lost < gamePoint - 1 ? gamePoint : lost < maxPoint - 1 ? lost + 2 : maxPoint;
  }

  /** Очки игры — сумма счёта обеих пар (как в getMeanSecondsPerPoint). */
  private gamePoints(lost_1_by: number | null, lost_2_by: number | null): number {
    if (lost_1_by !== null && lost_1_by !== undefined) return lost_1_by + this.winPoints(lost_1_by);
    if (lost_2_by !== null && lost_2_by !== undefined) return lost_2_by + this.winPoints(lost_2_by);
    return 0;
  }

  /** Редактирование матча из истории (карандаш): применяется пачка игр
   *  одним запросом. Записи с id — существующие игры: с заполненным
   *  счётом обновляются, с очищенным (null/null) — удаляются.
   *  Записи без id — новые колонки: пустые пропускаются, заполненные
   *  создаются с экстраполированным created_at — среднее время на очко
   *  матча до редактирования (интервал от первой до последней игры,
   *  делённый на очки игр после первой; фолбэк — среднее по системе,
   *  при нуле — время предыдущей игры). Пересчёт рейтинга — один
   *  каскад от матча в конце. */
  applyMatchGames = (match_id: number, games: {id?: number; lost_1_by: string | null; lost_2_by: string | null}[]) => {
    const existing = this.game.getAllByMatchId(match_id);
    const last = existing[existing.length - 1];
    const first = existing[0];

    // секунды на очко по матчу до редактирования
    let secondsPerPoint = 0;
    const pointsAfterFirst = existing.slice(1).reduce((sum, g) => sum + this.gamePoints(g.lost_1_by, g.lost_2_by), 0);
    if (last && first && last.created_at !== first.created_at && pointsAfterFirst > 0) {
      const durationSeconds = (new Date(last.created_at + 'Z').getTime() - new Date(first.created_at + 'Z').getTime()) / 1000;
      if (durationSeconds > 0) secondsPerPoint = durationSeconds / pointsAfterFirst;
    }
    if (secondsPerPoint <= 0) {
      secondsPerPoint = Number(matchRepository.getMeanSecondsPerPoint(false)) || 0;
    }

    let prevCreatedAt = last?.created_at;
    for (const g of games) {
      const lost_1 = g.lost_1_by === null || g.lost_1_by === undefined || g.lost_1_by === '' ? null : g.lost_1_by;
      const lost_2 = g.lost_2_by === null || g.lost_2_by === undefined || g.lost_2_by === '' ? null : g.lost_2_by;
      if (g.id !== undefined && g.id !== null) {
        if (lost_1 === null && lost_2 === null) {
          this.game.deleteById(Number(g.id));
        } else {
          this.game.update(Number(g.id), lost_1, lost_2);
        }
        continue;
      }
      if (lost_1 === null && lost_2 === null) continue; // пустая новая колонка
      // экстраполяция: предыдущая игра + время на очки новой игры
      const points = this.gamePoints(lost_1 === null ? null : Number(lost_1), lost_2 === null ? null : Number(lost_2));
      const next = new Date((prevCreatedAt ? new Date(prevCreatedAt + 'Z').getTime() : Date.now()) + Math.round(secondsPerPoint * points) * 1000);
      const createdAt = next.toISOString().slice(0, 19).replace('T', ' ');
      const result = this.game.create(match_id, lost_1, lost_2, createdAt);
      prevCreatedAt = createdAt;
      void result;
    }

    // один каскадный пересчёт на всю пачку — в фоне
    ratingService.scheduleRecalcFromMatch(match_id);
  };

  create110 = (match_110_id: number) => this.game110.create(match_110_id);
}

export default Game;
