import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import MatchService from '../services/match.ts';
import RatingService from '../services/rating.ts';
const matchService = new MatchService();
const ratingService = new RatingService();

router.get('/unfinished', (req, res) => {
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

// ручной каскадный пересчёт рейтинга матча и всех последующих — в фоне
router.post('/recalc-rating/:id', ensureLoggedIn(), (req, res) => {
  const id = Number(req.params.id);
  const source = ratingService.getRecalcSource(id);
  if (!source) {
    res.promise(Promise.reject(Object.assign(new Error('матч не найден'), {status: 404})));
    return;
  }
  ratingService.scheduleRecalc(source);
  res.promise(Promise.resolve({status: 'scheduled', match_id: id}));
});

export default router;