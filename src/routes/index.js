const Express = require('express'), router = Express.Router();
const CommonService = require('../services/common'), commonService = new CommonService();
const SettingsService = require('../services/settings'), settingsService = new SettingsService();
const TournamentService = require('../services/tournament'), tournamentService = new TournamentService();
const UnitService = require('../services/unit'), unitService = new UnitService();
const MatchService = require('../services/match'), matchService = new MatchService();
const GroupService = require('../services/group'), groupService = new GroupService();
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

      tournamentService.getCurrent()
      .then(t => {
        switch(t.tournament_type_id) {
          case 1:
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
                tournament_type: 1,
                units: promises[1],
                states: promises[2],
                regions: promises[3],
                cities: promises[4],
                matches: promises[5],
                playerNameFormatter: (id, name, sex, pic) => share.playerNameFormatter(id, name, sex, pic, req.useragent?.isMobile || false)
              });
            });
            break;

          case 2:
            Promise.all([
              tournamentService.getAll(), // 0
              unitService.getAll(),       // 1
              settingsService.states(),   // 2
              settingsService.regions(),  // 3
              settingsService.cities(),   // 4
              groupService.getAll()       // 5
            ])
            .then((promises) => {
              res.render('index', {
                user: req.user,
                device: commonService.device(req),
                tournaments: promises[0],
                units: promises[1],
                tournament_type: 2,
                states: promises[2],
                regions: promises[3],
                cities: promises[4],
                groups: promises[5],
                playerNameFormatter: (id, name, sex, pic) => share.playerNameFormatter(id, name, sex, pic, req.useragent?.isMobile || false)
              });
            });
            break;

          default:
            throw new Error(`Неизвестный тип турнира: ${t.tournament_type_id}!`);
        }
      })



    }
);

module.exports = router;
