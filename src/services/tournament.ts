import TournamentRepository from '../repositories/tournament.ts';
import SettingsService from './settings.ts';

class Tournament {
  declare static _instance: Tournament | undefined;
  tournament!: TournamentRepository;
  settings!: SettingsService;

  constructor() {
    if (Tournament._instance) {
      return Tournament._instance;
    }
    Tournament._instance = this;

    this.tournament = new TournamentRepository();
    this.settings = new SettingsService();
  }

  /** Авто-завершение турнира по лимиту матчей: если настройка matches > 0
   *  и каждый активный (available = 1) игрок сыграл не меньше matches
   *  завершённых матчей — турнир переводится в статус 3 «Завершён».
   *  Вызывается после фиксации завершения матча (пересчёт рейтинга). */
  checkMatchesLimit = (id?: number) => {
    const limit = Number(this.settings.get('matches', id));
    if (!limit) return false;
    const tournament = id
        ? this.tournament.getById(id)
        : this.tournament.getCurrent();
    // завершаем только идущий турнир: статус 2 «Идёт»
    if (!tournament || tournament.tournament_status_id !== 2) return false;
    const rows = this.tournament.availablePlayed(id);
    if (rows.length === 0 || rows.some(r => r.played < limit)) return false;
    this.setStatus(3, tournament.id);
    return true;
  };

  getCurrent = () => this.tournament.getCurrent();
  setCurrent = (id: number) => this.tournament.setCurrent(id);
  getAll = () => this.tournament.getAll();
  getById = (id: number) => this.tournament.getById(id);
  setStatus = (status_id: number, id?: number) => this.tournament.setStatus(status_id, id);
  setLostStatuses = () => this.tournament.setLostStatuses();
  setDeferredStatusHandlers = () => this.tournament.setDeferredStatusHandlers();
  create = (user_id: number, club_id: number, gym_id: number, type_id: number, name: string, registration_date: string, start_date: string, end_date: string, capacity: number, courts: number, min_rating: string, max_rating: string, rules_url: string, is_current: number, unit_id?: number, settings?: Record<string, string>) =>
      this.tournament.create(user_id, club_id, gym_id, type_id, name, registration_date, start_date, end_date, capacity, courts, min_rating, max_rating, rules_url, is_current, unit_id ?? 1, settings);
  isEveryonePaid = (id?: number) => this.tournament.isEveryonePaid(id);
  pay = (user_id: number, paid: number = 1) => this.tournament.pay(user_id, paid);
  hasGames = (id?: number) => this.tournament.hasGames(id);
  registeredCount = (id?: number) => this.tournament.registeredCount(id);
}

export default Tournament;
