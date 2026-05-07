const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const TournamentTypeService = require('../services/tournament-type'), tournamentTypeService = new TournamentTypeService();
router.get('/select', (req, res) => {
  res.promise(tournamentTypeService.select().then(g => ({results: g})));
});

module.exports = router;