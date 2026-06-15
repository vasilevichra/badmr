const Express = require('express'), router = Express.Router();
const CityService = require('../services/city'), cityService = new CityService();

router.get('/select/:region_id', (req, res) => {
  res.promise(cityService.select(req.params.region_id).then(c => ({results: c})));
});

router.get('/select', (req, res) => {
  res.promise(cityService.select().then(c => ({results: c})));
});

router.get('/find', (req, res) => {
  res.promise(cityService.findByName(req.query.name));
});

router.get('/:id', (req, res) => {
  res.promise(cityService.getById(req.params.id));
});

router.get('/team/:id', (req, res) => {
  res.promise(cityService.getByTeamId(req.params.id));
});

module.exports = router;
