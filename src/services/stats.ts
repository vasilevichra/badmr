import StatsRepository from '../repositories/stats.ts';

/** Статистика блока «Статистика» на главной турнира: колонка «Турнир»
 *  считается по турниру, «За всё время» — по scope турниров того же типа
 *  с теми же wins и game_point. */
class Stats {
  declare static _instance: Stats | undefined;
  stats!: StatsRepository;

  constructor() {
    if (Stats._instance) {
      return Stats._instance;
    }
    Stats._instance = this;

    this.stats = new StatsRepository();
  }

  cities = (tournamentId?: number) => this.stats.cities(this.resolve(tournamentId));
  participants = (tournamentId?: number) => this.stats.participants(this.resolve(tournamentId));
  avgRating = (tournamentId?: number) => this.stats.avgRating(this.resolve(tournamentId));
  newcomers = (tournamentId?: number) => this.stats.newcomers(this.resolve(tournamentId));
  games = (tournamentId?: number) => this.stats.games(this.resolve(tournamentId));
  matches = (tournamentId?: number) => this.stats.matches(this.resolve(tournamentId));
  longestGameSeconds = (tournamentId?: number) => this.stats.longestGameSeconds(this.resolve(tournamentId));
  longestMatchSeconds = (tournamentId?: number) => this.stats.longestMatchSeconds(this.resolve(tournamentId));
  avgGamesPerMatchAll = (tournamentId?: number) => this.stats.avgGamesPerMatchAll(this.resolve(tournamentId));
  ratingDelta = (tournamentId?: number) => this.stats.ratingDelta(this.resolve(tournamentId));
  topWinrate = (tournamentId?: number) => this.stats.topWinrate(this.resolve(tournamentId));
  capacityFillSeconds = (tournamentId?: number) => this.stats.capacityFillSeconds(this.resolve(tournamentId));

  /** Без явного id — текущий турнир (как в остальных статистиках маршрута);
   *  если текущего нет (например, страница 404) — id без данных. */
  private resolve(tournamentId?: number): number {
    if (tournamentId !== undefined) return tournamentId;
    return this.stats.db.get<{ id: number }>(
        `SELECT id FROM tournament WHERE current = 1 AND available = 1`)?.id ?? 0;
  }
}

export default Stats;
