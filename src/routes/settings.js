const Express = require('express'), router = Express.Router();
const SettingsService = require('../services/settings'), settingsService = new SettingsService();

router.get('/', (req, res) => {
  res.promise(() => settingsService.getAll());
});

router.get('/:name', (req, res) => {
  res.promise(() => settingsService.get(req.params.name));
});

module.exports = router;
