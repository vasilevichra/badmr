const Repository = require('../repositories/common')
const SettingsService = require('./settings')
const Promise = require('bluebird')
const _ = require('lodash');

const settingsService = new SettingsService();

class Common {
  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.repository = new Repository();
  }

  calcReady(calculated_objects = [], available_courts = 2) {
    if (available_courts === 0) {
      return new Promise(calculated_objects);
    }
    const deltaP = settingsService.get(settingsService.opt.DELTA);
    const readyP = this.repository.ready(calculated_objects);
    return Promise.join(deltaP, readyP, (delta, ready) => {
      const pairsRating = new Map();
      for (let i = 0; i < ready.length; i++) {
        for (let j = i + 1; j < ready.length; j++) {
          pairsRating.set([ready[i].user_id, ready[j].user_id], ready[i].rating + ready[j].rating);
        }
      }

      const usersMatches = new Map(ready.map(i => [i.user_id, i.matches]));

      const pairsRatingDiff = [];
      for (let [i_key, i_value] of pairsRating.entries()) {
        for (let [j_key, j_value] of pairsRating.entries()) {
          const diff = Math.abs(i_value - j_value);
          if (
              diff <= delta &&
              !i_key.some(r => j_key.includes(r)) &&
              !pairsRatingDiff.some(p =>
                  _.isEqual([p.players1[0].user_id, p.players1[1].user_id], j_key) &&
                  _.isEqual([p.players2[0].user_id, p.players2[1].user_id], i_key)
              )
          ) {
            pairsRatingDiff.push({
              players1: [ready.find(u => u.user_id === i_key[0]), ready.find(u => u.user_id === i_key[1])],
              players2: [ready.find(u => u.user_id === j_key[0]), ready.find(u => u.user_id === j_key[1])],
              diff: diff,
              matches: usersMatches.get(i_key[0]) + usersMatches.get(i_key[1]) + usersMatches.get(j_key[0]) + usersMatches.get(j_key[1])
            });
          }
        }
      }
      const pairsWithMinMatches = this.groupByNameAndGetMin(pairsRatingDiff, 'matches');
      return [this.groupByNameAndGetMin(pairsWithMinMatches, 'diff')[0]];
    })
    // .then(r => this.calcReady(calculated_objects.push(r), --available_courts))
    .tap((pairs) => console.log(pairs));
  }

  groupByNameAndGetMin(array, name) {
    const grouped = [...Map.groupBy(array, element => {
      return element[name];
    })];

    let min = Number.MAX_SAFE_INTEGER;
    let resultArray = [];
    for (const [key, valuesArray] of grouped) {
      if (key < min) {
        min = key;
        resultArray = valuesArray;
      }
    }

    return resultArray;
  }
}

module.exports = Common;