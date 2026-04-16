const CityRepository = require('../repositories/city');

class City {
  constructor() {
    if (City._instance) {
      return City._instance;
    }
    City._instance = this;

    this.city = new CityRepository();
  }

  select = () => this.city.select();
  getByTeamId = (team_id) => this.city.getByTeamId(team_id);
}

module.exports = City;