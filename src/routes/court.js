const Express = require('express');
const CourtService = require('../services/court');

const router = Express.Router();
const courtService = new CourtService();

router.get('/', (req, res) => {
  res.promise(courtService.getAll());
});

router.get('/:id', (req, res) => {
  res.promise(courtService.getById(req.params.id));
});

router.post('/enable', (req, res) => {
  console.log('тут!');
  res.promise(courtService.enableAll());
});

router.post('/enable/:number', (req, res) => {
  res.promise(courtService.enable(req.params.number));
});

router.post('/disable', (req, res) => {
  res.promise(courtService.disableAll());
});

router.post('/disable/:number', (req, res) => {
  res.promise(courtService.disable(req.params.number));
});

module.exports = router;