const UnitRepository = require('../repositories/unit');

class Unit {
  constructor() {
    if (Unit._instance) {
      return Unit._instance;
    }
    Unit._instance = this;

    this.unit = new UnitRepository();
  }

  getAll = () => this.unit.getAll();
}

module.exports = Unit;