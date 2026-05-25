const Express = require('express'), router = Express.Router();
const StateService = require('../services/state'), stateService = new StateService();

router.get('/select/:id', (req, res) => {
  res.promise(stateService.select(req.params.id).then(g => ({results: g})));
});
router.get('/select', (req, res) => {
  res.promise(stateService.select().then(g => ({results: g})));
});

router.get('/:id', (req, res) => {
  res.promise(stateService.getById(req.params.id));
});

module.exports = router;
