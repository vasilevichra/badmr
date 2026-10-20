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

  create = () => this.court.create();
  getAll = () => this.court.getAll();
  getById = (id: number) => this.court.getById(id);
  enableAll = () => this.court.enableAll();
  enable = (number: number) => this.court.enable(number);
  disableAll = () => this.court.disableAll();
  disable = (number: number) => this.court.disable(number);
  countAvailable = () => this.court.countAvailable();
  delete = (id: number) => this.court.delete(id);
  deleteAll = () => this.court.deleteAll();
}

export default Court;