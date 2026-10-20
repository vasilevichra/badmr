import TournamentRepository from '../repositories/tournament.ts';

class Tournament {
  declare static _instance: Tournament | undefined;
  tournament!: TournamentRepository;

  constructor() {
    if (Tournament._instance) {
      return Tournament._instance;
    }
    Tournament._instance = this;

    this.tournament = new TournamentRepository();
  }

  getCurrent = () => this.tournament.getCurrent();
  setCurrent = (id: number) => this.tournament.setCurrent(id);
  getAll = () => this.tournament.getAll();
  getById = (id: number) => this.tournament.getById(id);
  setStatus = (status_id: number, id?: number) => this.tournament.setStatus(status_id, id);
  setLostStatuses = () => this.tournament.setLostStatuses();
  setDeferredStatusHandlers = () => this.tournament.setDeferredStatusHandlers();
  create = (user_id: number, club_id: number, gym_id: number, type_id: number, name: string, registration_date: string, start_date: string, end_date: string, capacity: number, courts: number, min_rating: string, max_rating: string, rules_url: string, is_current: number, unit_id?: number) =>
      this.tournament.create(user_id, club_id, gym_id, type_id, name, registration_date, start_date, end_date, capacity, courts, min_rating, max_rating, rules_url, is_current, unit_id ?? 1);
  isEveryonePaid = (id?: number) => this.tournament.isEveryonePaid(id);
  pay = (user_id: number, paid: number = 1) => this.tournament.pay(user_id, paid);
  hasGames = (id?: number) => this.tournament.hasGames(id);
  registeredCount = (id?: number) => this.tournament.registeredCount(id);
}

export default Tournament;
