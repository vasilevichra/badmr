const CityRepository = require('../repositories/city');

class City {
  constructor() {
    if (City._instance) {
      return City._instance;
    }
    City._instance = this;

    this.city = new CityRepository();
  }

  select = (region_id) => this.city.select(region_id);
  getById = (id) => this.city.getById(id);
  getByTeamId = (team_id) => this.city.getByTeamId(team_id);
  getByUserId = (team_id) => this.city.getByUserId(team_id);
  findByName = (name) => this.city.findByName(name);
}

module.exports = City;