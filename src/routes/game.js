const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const GameService = require('../services/game'), gameService = new GameService();

router.get('/:id', (req, res) => {
  res.promise(gameService.getById(req.params.id));
});

router.post('/create', ensureLoggedIn, (req, res) => {
  const {match_id, lost_1_by, lost_2_by, created_at} = req.body;
  res.promise(gameService.create(match_id, lost_1_by || null, lost_2_by || null, created_at));
});

module.exports = router;