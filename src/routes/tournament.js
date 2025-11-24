const Express = require('express');
const TournamentService = require('../services/tournament');

const router = Express.Router();
const tournamentService = new TournamentService();

router.get('/', (req, res) => {
  res.promise(tournamentService.getAll());
});

router.get('/:id', (req, res) => {
  res.promise(tournamentService.getById(req.params.id));
});

router.get('/current/', (req, res) => {
  res.promise(tournamentService.getCurrent());
});

router.post('/current/:id', (req, res) => {
  res.promise(tournamentService.setCurrent(req.params.id));
});

module.exports = router;