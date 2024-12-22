const Repository = require('../repositories/common')
const Promise = require('bluebird')

class Common {
  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.repository = new Repository();
  }

  calcReady() {
    return this.repository
    .ready()
    .then((ready) => {
      const pairsRating = new Map();
      for (let i = 0; i < ready.length; i++) {
        for (let j = i + 1; j < ready.length; j++) {
          pairsRating.set([ready[i].id, ready[j].id], ready[i].rating + ready[j].rating);
        }
      }

      const pairsRatingDiff = new Map();
      for (let [i_key, i_value] of pairsRating.entries()) {
        for (let [j_key, j_value] of pairsRating.entries()) {
          if (!i_key.some(r => j_key.includes(r)) && !pairsRatingDiff.has(JSON.stringify({first: j_key, second: i_key}))) {
            pairsRatingDiff.set(JSON.stringify({first: i_key, second: j_key}), Math.abs(i_value - j_value));
          }
        }
      }

      console.log(pairsRatingDiff);

      return Object.fromEntries(pairsRatingDiff.entries()); // HashMap<Tuple(List<Int, Int>, List<Int, Int>)>
    });
  }
}

module.exports = Common;