const Express = require('express');
const CommonService = require('../services/common');
const SettingsService = require('../services/settings');
const TournamentService = require('../services/tournament');
const UnitService = require('../services/unit');
const Promise = require('bluebird');

const router = Express.Router();
const commonService = new CommonService();
const settingsService = new SettingsService();
const tournamentService = new TournamentService();
const unitService = new UnitService();

router.get(
    '/',
    // (req, res, next) => {
    //   if (!req.user) {
    //     return res.render('home');
    //   }
    //   next();
    // },
    (req, res) => {
      res.locals.filter = null;

      Promise.all([
        tournamentService.getAll(), // 0
        unitService.getAll(),       // 1
        settingsService.states(),   // 2
        settingsService.regions(),  // 3
        settingsService.cities()    // 4
      ])
      .then((promises) => {
        res.render('index', {
          user: req.user,
          device: commonService.device(req),
          tournaments: promises[0],
          units: promises[1],
          states: promises[2],
          regions: promises[3],
          cities: promises[4]
        });
      });

    }
);

module.exports = router;
