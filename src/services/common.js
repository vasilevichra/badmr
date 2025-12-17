const Repository = require('../repositories/common');
const SettingsService = require('./settings'), settingsService = new SettingsService();
const CourtService = require('./court'), courtService = new CourtService();
const Promise = require('bluebird');
const _ = require('lodash');

class Common {
  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.repository = new Repository();
  }

  device = (req) => {
    if (req.useragent?.isMobile) {
      return 'phone';
    } else {
      return 'desktop'
    }
  }

  ready = async () => {
    let available_courts = await courtService.countAvailable();
    if (available_courts === 0) {
      return Promise.resolve([]);
    }
    const delta = await settingsService.get(settingsService.opt.DELTA).then(Number);
    const sort = await settingsService.get(settingsService.opt.SORT);

    let calculated_objects = [];
    while (available_courts-- > 0) {
      calculated_objects.push(await this.calcReadyRec(delta, sort, calculated_objects));
    }

    return Promise.resolve(calculated_objects.flat(1))
    .tap((pairs) => console.log(`Selected ${pairs.length} pairs: ${JSON.stringify(pairs)}`));
  };

  calcReadyRec(delta, sort, calculated_objects) {
    return this.repository.ready(calculated_objects)
    .then(ready => {
      const pairsRating = new Map();
      for (let i = 0; i < ready.length; i++) {
        for (let j = i + 1; j < ready.length; j++) {
          pairsRating.set([ready[i].user_id, ready[j].user_id], (ready[i].rating + ready[j].rating) / 2);
        }
      }

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

            const readyPlayer11 = ready.find(u => u.user_id === i_key[0]);
            const readyPlayer12 = ready.find(u => u.user_id === i_key[1]);
            const readyPlayer21 = ready.find(u => u.user_id === j_key[0]);
            const readyPlayer22 = ready.find(u => u.user_id === j_key[1]);
            pairsRatingDiff.push({
              players1: [readyPlayer11, readyPlayer12],
              players2: [readyPlayer21, readyPlayer22],
              diff: diff,
              matches: readyPlayer11.matches + readyPlayer12.matches + readyPlayer21.matches + readyPlayer22.matches,
              played: readyPlayer11.played + readyPlayer12.played + readyPlayer21.played + readyPlayer22.played,
            });
          }
        }
      }
      return pairsRatingDiff;
    })
    .then(pairsRatingDiff => {
      if (pairsRatingDiff.length === 0) {
        return [];
      } else {
        let result = pairsRatingDiff;
        sort.split(',').forEach(s => {
          result = this.groupByNameAndGetMin(result, s);
        })
        return [result[0]];
      }
    });
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
