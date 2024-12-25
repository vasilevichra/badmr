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

  calcReady(tournament_id) {
    const deltaP = settingsService.get(settingsService.opt.DELTA, tournament_id);
    const readyP = this.repository.ready(tournament_id);
    return Promise.join(deltaP, readyP, (delta, ready) => {
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
          const diff = Math.abs(i_value - j_value);
          if (
              diff <= delta &&
              !i_key.some(r => j_key.includes(r)) &&
              !pairsRatingDiff.some(p => _.isEqual(p.ids1, j_key) && _.isEqual(p.ids2, i_key))
          ) {
            pairsRatingDiff.push({
              ids1: i_key,
              ids2: j_key,
              diff: diff,
              matches: usersMatches.get(i_key[0]) + usersMatches.get(i_key[1]) + usersMatches.get(j_key[0]) + usersMatches.get(j_key[1])
            });
          }
        }
      }
      const pairsWithMinMatches = this.groupByNameAndGetMin(pairsRatingDiff, 'matches');
      return this.groupByNameAndGetMin(pairsWithMinMatches, 'diff')[0];
    })
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