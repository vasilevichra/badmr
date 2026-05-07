const TournamentRepository = require('../repositories/tournament');

class Tournament {
  constructor() {
    if (Tournament._instance) {
      return Tournament._instance;
    }
    Tournament._instance = this;

    this.tournament = new TournamentRepository();
  }

  getCurrent = () => this.tournament.getCurrent();
  setCurrent = (id) => this.tournament.setCurrent(id);
  getAll = () => this.tournament.getAll();
  getById = (id) => this.tournament.getById(id);
  create = (type, name, registration, start, end, latitude, longitude, address, mapUrl, rules, current) =>
      this.tournament.create(type, name, registration, start, end, latitude, longitude, address, mapUrl, rules, current);
}

module.exports = Tournament;