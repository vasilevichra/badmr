import Express from 'express';
const router = Express.Router();
import SettingsService from '../services/settings.ts';
import BasketService from '../services/basket.ts';
import requestedTournament from '../tournament-request.ts';
const settingsService = new SettingsService();
const basketService = new BasketService();

router.get('/', (req, res) => {
  // ?relevant=1 — только настройки, релевантные типу турнира (таблица
  // настроек на странице турнира); без параметра — все, как раньше
  res.promise(() => settingsService.getAll(requestedTournament(req), req.query.relevant !== undefined));
});

router.get('/:name', (req, res) => {
  res.promise(() => settingsService.get(req.params.name, requestedTournament(req)));
});

router.post('/:name', (req, res) => {
  res.promise(async () => {
    const tournamentId = requestedTournament(req);
    await settingsService.set(req.params.name, req.body.value, tournamentId);
    // смена схемы котла перестраивает (или сбрасывает) его корзины;
    // здесь, а не в settingsService — basket читает настройки через него
    basketService.onOrgSystemSet(tournamentId, req.params.name, req.body.value);
  });
});

export default router;
