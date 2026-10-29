import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import GameService from '../services/game.ts';
const gameService = new GameService();

router.get('/current110', (req, res) => {
  res.promise(gameService.getCurrentByTeamIds(Number(req.query.team_1_id), Number(req.query.team_2_id)));
});

router.get('/:id', (req, res) => {
  res.promise(gameService.getById(Number(req.params.id)));
});

router.post('/current110/increase', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.increaseCurrentByTeamIds(Number(req.query.team_1_id), Number(req.query.team_2_id), String(req.query.team_number)));
});

router.post('/create', ensureLoggedIn(), (req, res) => {
  const {match_id, lost_1_by, lost_2_by, created_at} = req.body;
  res.promise(gameService.create(match_id, lost_1_by || null, lost_2_by || null, created_at));
});

router.post('/update/:id', ensureLoggedIn(), (req, res) => {
  const {lost_1_by, lost_2_by} = req.body;
  res.promise(gameService.update(Number(req.params.id), lost_1_by ?? null, lost_2_by ?? null));
});

router.post('/delete/:id', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.deleteById(Number(req.params.id)));
});

// редактирование матча из истории (карандаш): пачка игр одним запросом —
// обновить изменённые, удалить очищенные, создать новые с экстраполированным
// временем; пересчёт рейтинга — один каскад внутри applyMatchGames
router.post('/bulk/:match_id', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.applyMatchGames(Number(req.params.match_id), req.body.games ?? []));
});

router.post('/create110/:match_110_id', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.create110(Number(req.params.match_110_id)));
});

export default router;