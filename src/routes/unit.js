const Express = require('express');
const UnitService = require('../services/unit');

const router = Express.Router();
const unitService = new UnitService();

router.get('/', (req, res) => {
  res.promise(unitService.getAll());
});

module.exports = router;
