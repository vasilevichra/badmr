const RatingRepository = require('../repositories/rating');

class Rating {
  constructor() {
    if (Rating._instance) {
      return Rating._instance;
    }
    Rating._instance = this;

    this.rating = new RatingRepository();
  }

  getByUserId = (user_id) => this.rating.getByUserId(user_id);
}

module.exports = Rating;