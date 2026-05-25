const RegionRepository = require('../repositories/region');

class Region {
  constructor() {
    if (Region._instance) {
      return Region._instance;
    }
    Region._instance = this;

    this.region = new RegionRepository();
  }

  select = (state_id) => this.region.select(state_id);
  getById = (id) => this.region.getById(id);
  getByUserId = (user_id) => this.region.getByUserId(user_id);
}

module.exports = Region;