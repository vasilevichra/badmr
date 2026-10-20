import GymRepository from '../repositories/gym.ts';

class Gym {
  declare static _instance: Gym | undefined;
  gym!: GymRepository;

  constructor() {
    if (Gym._instance) {
      return Gym._instance;
    }
    Gym._instance = this;

    this.gym = new GymRepository();
  }

  select = (user_club_id?: number) => this.gym.select(user_club_id);
}

export default Gym;