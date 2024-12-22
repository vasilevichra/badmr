const CourtRepository = require('../repositories/court')

class Court {
  constructor() {
    if (Court._instance) {
      return Court._instance;
    }
    Court._instance = this;

    this.repository = new CourtRepository();
  }

  getAvailable = () => this.repository.getAvailable();
  getById = (id) => this.repository.getById(id);
}

module.exports = Court;