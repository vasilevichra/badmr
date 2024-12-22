const Express = require('express');
const CourtService = require('../services/court');

const router = Express.Router();
const courtService = new CourtService();

router.get('/', (req, res) => {
  res.promise(courtService.getAvailable());
});

router.get('/:id', (req, res) => {
  res.promise(() => courtService.getById(req.params.id));
});

module.exports = router;