const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const MatchService = require('../services/match'), matchService = new MatchService();

router.get('/unfinished', ensureLoggedIn, (req, res) => {
  res.promise(matchService.getAllUnfinished());
});

router.get('/:user_id', ensureLoggedIn, (req, res) => {
  res.promise(matchService.getAllByUser(req.params.user_id));
});

router.post('/create', ensureLoggedIn, (req, res) => {
  const {user_1_id, user_2_id, user_3_id, user_4_id} = req.body;
  res.promise(matchService.create(user_1_id, user_2_id, user_3_id, user_4_id));
});

router.post('/create110', ensureLoggedIn, (req, res) => {
  const {team_1_id, team_2_id} = req.body;
  res.promise(matchService.create110(team_1_id, team_2_id));
});

router.post('/delete/:id', ensureLoggedIn, (req, res) => {
  res.promise(matchService.deleteById(req.params.id));
});

module.exports = router;