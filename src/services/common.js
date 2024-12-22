const Repository = require('../repositories/common')
const _ = require('lodash');

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

      const usersMatches = new Map(ready.map(i => [i.id, i.matches]));

      const pairsRatingDiff = [];
      for (let [i_key, i_value] of pairsRating.entries()) {
        for (let [j_key, j_value] of pairsRating.entries()) {
          if (
              !i_key.some(r => j_key.includes(r)) &&
              !pairsRatingDiff.some(p => _.isEqual(p.ids1, j_key) && _.isEqual(p.ids2, i_key))
          ) {
            pairsRatingDiff.push({
              ids1: i_key,
              ids2: j_key,
              diff: Math.abs(i_value - j_value),
              matches: usersMatches.get(i_key[0]) + usersMatches.get(i_key[1]) + usersMatches.get(j_key[0]) + usersMatches.get(j_key[1])
            });
          }
        }
      }
      return pairsRatingDiff;
    });
  }
}

module.exports = Common;