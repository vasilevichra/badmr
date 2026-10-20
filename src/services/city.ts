import CityRepository from '../repositories/city.ts';

class City {
  declare static _instance: City | undefined;
  city!: CityRepository;

  constructor() {
    if (City._instance) {
      return City._instance;
    }
    City._instance = this;

    this.city = new CityRepository();
  }

  select = (region_id?: number) => this.city.select(region_id);
  getById = (id: number) => this.city.getById(id);
  getByTeamId = (team_id: number) => this.city.getByTeamId(team_id);
  getByUserId = (team_id: number) => this.city.getByUserId(team_id);
  findByName = (name: string) => this.city.findByName(name);
}


export default City;
