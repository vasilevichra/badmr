const Express = require('express');
const GameService = require('../services/game');

const router = Express.Router();
const gameService = new GameService();

router.get('/:id', (req, res) => {
  res.promise(gameService.getById(req.params.id));
});

router.post('/create', (req, res) => {
  const {match_id, lost_1_by, lost_2_by} = req.body;
  res.promise(gameService.create(match_id, lost_1_by || null, lost_2_by || null));
});

module.exports = router;