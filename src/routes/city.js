const Express = require('express'), router = Express.Router();
const CityService = require('../services/city'), cityService = new CityService();

router.get('/select', (req, res) => {
  res.promise(cityService.select().then(g => ({results: g})));
});

router.get('/team/:id', (req, res) => {
  res.promise(cityService.getByTeamId(req.params.id));
});

module.exports = router;
