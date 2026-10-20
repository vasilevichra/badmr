import Express from 'express';
const router = Express.Router();
import SettingsService from '../services/settings.ts';
const settingsService = new SettingsService();

router.get('/', (req, res) => {
  res.promise(() => settingsService.getAll());
});

router.get('/:name', (req, res) => {
  res.promise(() => settingsService.get(req.params.name));
});

router.post('/:name', (req, res) => {
  res.promise(() => settingsService.set(req.params.name, req.body.value));
});

export default router;
