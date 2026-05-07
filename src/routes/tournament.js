const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const TournamentService = require('../services/tournament'), tournamentService = new TournamentService();

router.get('/', (req, res) => {
  res.promise(tournamentService.getAll());
});

router.get('/:id', (req, res) => {
  res.promise(tournamentService.getById(req.params.id));
});

router.get('/current/', ensureLoggedIn, (req, res) => {
  res.promise(tournamentService.getCurrent());
});

router.post('/create', ensureLoggedIn, (req, res) => {
  const {type, name, regd, regt, startd, startt, endd, endt, lat, lon, addr, map, rules, cur} = req.body;
  const reg = `${regd} ${regt}:00`;
  const start = `${startd} ${startt}:00`;
  const end = endd ? `${endd} ${endt}:00` : null;
  const current = cur === 'on' ? 1 : 0;
  res.promise(tournamentService.create(type, name, reg, start, end, lat || null, lon || null, addr, map || null, rules || null, current));
});

router.post('/current/:id', ensureLoggedIn, (req, res) => {
  res.promise(tournamentService.setCurrent(req.params.id));
});

module.exports = router;