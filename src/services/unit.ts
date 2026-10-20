import UnitRepository from '../repositories/unit.ts';

class Unit {
  declare static _instance: Unit | undefined;
  unit!: UnitRepository;

  constructor() {
    if (Unit._instance) {
      return Unit._instance;
    }
    Unit._instance = this;

    this.unit = new UnitRepository();
  }

  getAll = () => this.unit.getAll();
}

export default Unit;