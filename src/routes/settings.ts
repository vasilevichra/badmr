import Express from 'express';
const router = Express.Router();
import SettingsService from '../services/settings.ts';
import requestedTournament from '../tournament-request.ts';
const settingsService = new SettingsService();

router.get('/', (req, res) => {
  res.promise(() => settingsService.getAll(requestedTournament(req)));
});

router.get('/:name', (req, res) => {
  res.promise(() => settingsService.get(req.params.name, requestedTournament(req)));
});

router.post('/:name', (req, res) => {
  res.promise(() => settingsService.set(req.params.name, req.body.value));
});

export default router;
