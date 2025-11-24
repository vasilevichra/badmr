const Express = require('express');
const MatchService = require('../services/match');

const router = Express.Router();
const matchService = new MatchService();

router.get('/unfinished', (req, res) => {
  res.promise(matchService.getAllUnfinished());
});

router.get('/unfinished/has', (req, res) => {
  res.promise(matchService.hasUnfinished());
});

router.post('/create', (req, res) => {
  const {user_1_id, user_2_id, user_3_id, user_4_id} = req.body;
  res.promise(matchService.create(user_1_id, user_2_id, user_3_id, user_4_id));
});

module.exports = router;