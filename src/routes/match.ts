import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import MatchService from '../services/match.ts';
import RatingService from '../services/rating.ts';
import BracketService from '../services/bracket.ts';
import requestedTournament from '../tournament-request.ts';
const matchService = new MatchService();
const ratingService = new RatingService();
const bracketService = new BracketService();

router.get('/unfinished', (req, res) => {
  res.promise(matchService.getAllUnfinished(requestedTournament(req)));
});

// состояние сетки котла 110 для отрисовки: структура + матчи слотов.
// объявлен до '/:user_id', иначе 'bracket110' захватится как user_id
router.get('/bracket110', (req, res) => {
  res.promise(matchService.bracket110(requestedTournament(req), Number(req.query.group)));
});

router.get('/:user_id', ensureLoggedIn(), (req, res) => {
  res.promise(matchService.getAllByUser(Number(req.params.user_id), requestedTournament(req)));
});

router.post('/create', ensureLoggedIn(), (req, res) => {
  const {user_1_id, user_2_id, user_3_id, user_4_id} = req.body;
  res.promise(matchService.create(user_1_id, user_2_id, user_3_id, user_4_id, requestedTournament(req)));
});

router.post('/create110', ensureLoggedIn(), (req, res) => {
  const {team_1_id, team_2_id} = req.body;
  res.promise(matchService.create110(team_1_id, team_2_id, requestedTournament(req)));
});

// генерация олимпийской сетки котла 110: seed-матчи раунда 1, дальше —
// ленивый роутинг по завершении матчей
router.post('/generate110', ensureLoggedIn(), (req, res) => {
  const groupId = Number(req.body?.group_id ?? req.query.group_id);
  res.promise(bracketService.generate(requestedTournament(req), groupId));
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