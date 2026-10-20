import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import MatchService from '../services/match.ts';
const matchService = new MatchService();

router.get('/unfinished', ensureLoggedIn(), (req, res) => {
  res.promise(matchService.getAllUnfinished());
});

router.get('/:user_id', ensureLoggedIn(), (req, res) => {
  res.promise(matchService.getAllByUser(Number(req.params.user_id)));
});

router.post('/create', ensureLoggedIn(), (req, res) => {
  const {user_1_id, user_2_id, user_3_id, user_4_id} = req.body;
  res.promise(matchService.create(user_1_id, user_2_id, user_3_id, user_4_id));
});

router.post('/create110', ensureLoggedIn(), (req, res) => {
  const {team_1_id, team_2_id} = req.body;
  res.promise(matchService.create110(team_1_id, team_2_id));
});

router.post('/delete/:id', ensureLoggedIn(), (req, res) => {
  res.promise(matchService.deleteById(Number(req.params.id)));
});

export default router;