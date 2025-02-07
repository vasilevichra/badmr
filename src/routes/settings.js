const Express = require('express');
const SettingsService = require('../services/settings');

const router = Express.Router();
const settingsService = new SettingsService();

router.get('/', (req, res) => {
  res.promise(() => settingsService.getAll());
});

router.get('/:name', (req, res) => {
  res.promise(() => settingsService.get(req.params.name));
});

module.exports = router;