const Express = require('express'), router = Express.Router();
const RegionService = require('../services/region'), regionService = new RegionService();

router.get('/select/:state_id', (req, res) => {
  res.promise(regionService.select(req.params.state_id).then(r => ({results: r})));
});
router.get('/select', (req, res) => {
  res.promise(regionService.select().then(r => ({results: r})));
});
router.get('/:id', (req, res) => {
  res.promise(regionService.getById(req.params.id));
});

module.exports = router;
