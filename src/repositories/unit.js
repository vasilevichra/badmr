const Repository = require('./common');

class Unit {
  constructor() {
    if (Unit._instance) {
      return Unit._instance;
    }
    Unit._instance = this;

    this.db = new Repository().db;
  }

  getAll() {
    return this.db.all(
        `SELECT *
         FROM unit u
         ORDER BY id DESC`);
  }
}

module.exports = Unit;