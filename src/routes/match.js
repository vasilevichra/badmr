const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const MatchService = require('../services/match'), matchService = new MatchService();

router.get('/unfinished', ensureLoggedIn, (req, res) => {
  res.promise(matchService.getAllUnfinished());
});

router.get('/unfinished/has', ensureLoggedIn, (req, res) => {
  res.promise(matchService.hasUnfinished());
});

router.get('/finished/last', (req, res) => {
  res.promise(matchService.getAllFinishedAtLastSession());
});

router.post('/create', ensureLoggedIn, (req, res) => {
  const {user_1_id, user_2_id, user_3_id, user_4_id} = req.body;
  res.promise(matchService.create(user_1_id, user_2_id, user_3_id, user_4_id));
});

module.exports = router;