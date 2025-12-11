const Express = require('express'), router = Express.Router();
const CommonService = require('../services/common'), commonService = new CommonService();
const SettingsService = require('../services/settings'), settingsService = new SettingsService();
const TournamentService = require('../services/tournament'), tournamentService = new TournamentService();
const UnitService = require('../services/unit'), unitService = new UnitService();
const MatchService = require('../services/match'), matchService = new MatchService();
const Promise = require('bluebird');
const share = require('../share');

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
        tournamentService.getAll(),                // 0
        unitService.getAll(),                      // 1
        settingsService.states(),                  // 2
        settingsService.regions(),                 // 3
        settingsService.cities(),                  // 4
        matchService.getAllFinishedAtLastSession() // 5
      ])
      .then((promises) => {
        res.render('index', {
          user: req.user,
          device: commonService.device(req),
          tournaments: promises[0],
          units: promises[1],
          states: promises[2],
          regions: promises[3],
          cities: promises[4],
          matches: promises[5],
          playerNameFormatter: function (id, name, sex, pic) {
            return share.playerNameFormatter(id, name, sex, pic, req.useragent?.isMobile || false)
          }
        });
      });

    }
);

module.exports = router;
