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

      const isPhone = () => !(req.useragent.isDesktop || req.useragent.isTablet || req.useragent.isSmartTV) || false;

      tournamentService.getCurrent()
      .then(t => {
        switch(t.tournament_type_id) {
          case 1: // new
            Promise.all([
              tournamentService.getAll(),                // 0
              tournamentService.registeredCount(),       // 1
              unitService.getAll(),                      // 2
              settingsService.getDefaults(),             // 3
              settingsService.getSettings(),             // 4
              settingsService.states(),                  // 5
              settingsService.regions(),                 // 6
              settingsService.cities(),                  // 7
              matchService.getAllFinishedAtLastSession() // 8
            ])
            .then((promises) => {
              res.render('index', {
                device: commonService.device(req),
                user: req.user,
                tournaments: promises[0],
                tournament_type: 1,
                registered_count: promises[1],
                units: promises[2],
                defaults: promises[3],
                settings: promises[4],
                states: promises[5],
                regions: promises[6],
                cities: promises[7],
                matches: promises[8],
                playerNameFormatter: (id, name, sex, pic) => share.playerNameFormatter(id, name, sex, pic, isPhone())
              });
            });
            break;

          case 2: // 110
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
                device: commonService.device(req),
                user: req.user,
                tournaments: promises[0],
                units: promises[1],
                tournament_type: 2,
                states: promises[2],
                regions: promises[3],
                cities: promises[4],
                groups: promises[5],
                playerNameFormatter: (id, name, sex, pic) => share.playerNameFormatter(id, name, sex, pic, isPhone())
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
