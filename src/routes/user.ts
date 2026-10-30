import Express from 'express';
const router = Express.Router();
// const csrf = require('csurf');
import { ensureLoggedIn } from 'connect-ensure-login';
import UserService from '../services/user.ts';
import TournamentService from '../services/tournament.ts';
import requestedTournament from '../tournament-request.ts';
const userService = new UserService();
const tournamentService = new TournamentService();

// const csrfProtection = csrf({ cookie: true });
// const parseForm = Express.urlencoded({ extended: false });

router.post('/create', (req, res) => {
  const {ln, fn, pn, account, rate, sex, city, bd, tel, mail} = req.body;
  const userSex = sex === 'on' ? 1 : 0;
  res.promise(userService.create(ln, fn, pn, account ? 1.4 * Number(rate) : rate, userSex, city, bd));
});

router.get('/find', (req, res) => {
  // город проведения турнира — для приоритезации вариантов при поиске
  const tid = requestedTournament(req);
  const tournament = tid ? tournamentService.getById(tid) : tournamentService.getCurrent();
  const city_id = (tournament as { city_id?: number } | undefined)?.city_id;
  res.promise(userService.findBy(String(req.query.lastname), String(req.query.firstname), String(req.query.patronymic), city_id));
});

router.post('/enable/:ids', ensureLoggedIn(), (req, res) => {
  res.promise(userService.enable(String(req.params.ids).split(',').map(Number)));
});
router.post('/disable/:ids', ensureLoggedIn(), (req, res) => {
  res.promise(userService.disable(String(req.params.ids).split(',').map(Number)));
});

router.get('/archived', ensureLoggedIn(), (req, res) => {
  res.promise(userService.getArchived(requestedTournament(req)));
});

router.post('/archive/:id', ensureLoggedIn(), (req, res) => {
  res.promise(userService.archive(Number(req.params.id)));
});

router.post('/archive', ensureLoggedIn(), (req, res) => {
  res.promise(userService.archiveAll());
});

router.post('/unarchive/:id', ensureLoggedIn(), (req, res) => {
  res.promise(userService.unarchive(Number(req.params.id)));
});

router.post('/unarchive', ensureLoggedIn(), (req, res) => {
  res.promise(userService.unarchiveAll());
});

router.get('/', (req, res) => {
  res.promise(userService.getAll(requestedTournament(req)));
});

router.get('/select/:city_id', ensureLoggedIn(), (req, res) => {
  res.promise({results: userService.select(Number(req.params.city_id))});
});

router.get('/registered/:id', (req, res) => {
  res.promise(userService.isRegistered(Number(req.params.id)));
});

router.get('/rating/:id', (req, res) => {
  res.promise(userService.getRating(Number(req.params.id)));
});

router.get('/buddies/:id', (req, res) => {
  res.promise(userService.getBuddiesById(Number(req.params.id)));
});

router.get('/lab/search', (req, res) => {
  // город необязателен: без параметра фильтр по городу не применяется
  // (String(undefined) дал бы строку "undefined" и отсёк все результаты)
  const city = req.query.city ? String(req.query.city) : null;
  res.promise(userService.labSearch(String(req.query.name), city, Number(req.query.user_id)));
});

router.get('/:id', (req, res) => {
  res.promise(userService.getById(Number(req.params.id)));
});

router.post('/register/:ids', (req, res) => {
  res.promise(userService.registerByIds(String(req.params.ids).split(',').map(Number)));
});

router.post('/deregister/:ids', ensureLoggedIn(), (req, res) => {
  res.promise(userService.deregisterByIds(String(req.params.ids).split(',').map(Number)));
});

router.post('/actualize', ensureLoggedIn(), (req, res) => {
  res.promise(userService.actualize());
});

router.post('/rating/:id', ensureLoggedIn(), (req, res) => {
  res.promise(userService.setRating(Number(req.params.id), Number(req.query.new)));
});

router.post('/lab', (req, res) => {
  res.promise(userService.labCrawl());
});

export default router;
