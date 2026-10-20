import RatingRepository from '../repositories/rating.ts';

class Rating {
  declare static _instance: Rating | undefined;
  rating!: RatingRepository;

  constructor() {
    if (Rating._instance) {
      return Rating._instance;
    }
    Rating._instance = this;

    this.rating = new RatingRepository();
  }

  getByUserId = (user_id: number) => this.rating.getByUserId(user_id);
}

export default Rating;