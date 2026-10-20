import RegionRepository from '../repositories/region.ts';

class Region {
  declare static _instance: Region | undefined;
  region!: RegionRepository;

  constructor() {
    if (Region._instance) {
      return Region._instance;
    }
    Region._instance = this;

    this.region = new RegionRepository();
  }

  select = (state_id?: number) => this.region.select(state_id);
  getById = (id: number) => this.region.getById(id);
  getByUserId = (user_id: number) => this.region.getByUserId(user_id);
}

export default Region;