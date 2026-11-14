import CourtRepository from '../repositories/court.ts';

class Court {
  declare static _instance: Court | undefined;
  court!: CourtRepository;

  constructor() {
    if (Court._instance) {
      return Court._instance;
    }
    Court._instance = this;

    this.court = new CourtRepository();
  }

  create = (tournamentId?: number) => this.court.create(tournamentId);
  getAll = (tournamentId?: number) => this.court.getAll(tournamentId);
  getById = (id: number) => this.court.getById(id);
  enableAll = (tournamentId?: number) => this.court.enableAll(tournamentId);
  // async: отклонённый промис превращается promise-мидлварой в {error: message}
  // (sync throw в роуте дал бы HTML-страницу ошибки)
  enable = async (number: number, tournamentId?: number) => {
    if (this.court.countBusy(number, tournamentId) > 0) {
      throw new Error(`На корте №${number} идёт игра`);
    }
    return this.court.enable(number, tournamentId);
  };
  disableAll = (tournamentId?: number) => this.court.disableAll(tournamentId);
  disable = (number: number, tournamentId?: number) => this.court.disable(number, tournamentId);
  countAvailable = (tournamentId?: number) => this.court.countAvailable(tournamentId);
  delete = (id: number) => this.court.delete(id);
  deleteAll = (tournamentId?: number) => this.court.deleteAll(tournamentId);
}

export default Court;