const CourtRepository = require('../repositories/court');

class Court {
  constructor() {
    if (Court._instance) {
      return Court._instance;
    }
    Court._instance = this;

    this.court = new CourtRepository();
  }

  getAll = () => this.court.getAll();
  getById = (id) => this.court.getById(id);
  enableAll = () => this.court.enableAll();
  enable = (number) => this.court.enable(number);
  disableAll = () => this.court.disableAll();
  disable = (number) => this.court.disable(number);
  countAvailable = () => this.court.countAvailable();
}

module.exports = Court;