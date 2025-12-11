const Express = require('express'), router = Express.Router();
const UnitService = require('../services/unit'), unitService = new UnitService();

router.get('/', (req, res) => {
  res.promise(unitService.getAll());
});

module.exports = router;
