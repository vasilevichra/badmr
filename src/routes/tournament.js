const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const TournamentService = require('../services/tournament'), tournamentService = new TournamentService();

router.get('/', (req, res) => {
  res.promise(tournamentService.getAll());
});

router.get('/:id', (req, res) => {
  res.promise(tournamentService.getById(req.params.id));
});

router.get('/current/', (req, res) => {
  res.promise(tournamentService.getCurrent());
});

router.post('/current/:id', ensureLoggedIn, (req, res) => {
  res.promise(tournamentService.setCurrent(req.params.id));
});

module.exports = router;