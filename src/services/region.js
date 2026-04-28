const RegionRepository = require('../repositories/region');

class Region {
  constructor() {
    if (Region._instance) {
      return Region._instance;
    }
    Region._instance = this;

    this.region = new RegionRepository();
  }

  getByUserId = (user_id) => this.region.getByUserId(user_id);
}

module.exports = Region;