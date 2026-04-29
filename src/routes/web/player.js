const Express = require('express'), router = Express.Router();
const UserService = require('../../services/user'), userService = new UserService();
const CityService = require('../../services/city'), cityService = new CityService();
const RegionService = require('../../services/region'), regionService = new RegionService();
const StateService = require('../../services/state'), stateService = new StateService();
const Promise = require('bluebird');
const share = require('../../share');

router.get('/:id', (req, res) => {
  const userId = req.params.id;
  Promise.all([
    userService.getById(userId),              // 0
    userService.getRating(userId),            // 1
    userService.getDaysUntilBirthday(userId), // 2
    cityService.getByUserId(userId),          // 3
    regionService.getByUserId(userId),        // 4
    stateService.getByUserId(userId),         // 5
    userService.getMatchesCount(userId),      // 6
    userService.getGamesCount(userId),        // 7
    userService.getCoWinnersById(userId),     // 8
    userService.getCoLosersById(userId),      // 9
    userService.getBuddiesById(userId),       // 10
  ])
  .then((promises) => {
    return res.render('modal/player/id', {
      login: req.isAuthenticated() ? req.user : null,
      user: promises[0],
      rating: promises[1],
      days_until_birthday: promises[2],
      city: promises[3],
      region: promises[4],
      state: promises[5],
      matches: promises[6],
      games: promises[7],
      co_winners: promises[8],
      co_losers: promises[9],
      buddies: promises[10],
      playerNameFormatter: (id, name, sex, pic) => share.playerNameFormatter(id, name, sex, pic, req.useragent?.isMobile || false)
    });
  });

});

module.exports = router;