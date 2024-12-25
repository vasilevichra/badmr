const Express = require('express');
const SettingsService = require('../services/settings');

const router = Express.Router();
const settingsService = new SettingsService();

router.get('/:name', (req, res) => {
  const {id, tournament_id} = req.query;
  res.promise(() => settingsService.get(req.params.name, tournament_id));
});

module.exports = router;