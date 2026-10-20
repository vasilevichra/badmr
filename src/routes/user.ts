import Express from 'express';
const router = Express.Router();
// const csrf = require('csurf');
import { ensureLoggedIn } from 'connect-ensure-login';
import UserService from '../services/user.ts';
const userService = new UserService();

// const csrfProtection = csrf({ cookie: true });
// const parseForm = Express.urlencoded({ extended: false });

router.post('/create', (req, res) => {
  const {ln, fn, pn, account, rate, sex, city, bd, tel, mail} = req.body;
  const userSex = sex === 'on' ? 1 : 0;
  res.promise(userService.create(ln, fn, pn, account ? 1.4 * Number(rate) : rate, userSex, city, bd));
});

router.get('/find', (req, res) => {
  res.promise(userService.findBy(String(req.query.lastname), String(req.query.firstname), String(req.query.patronymic)));
});

router.post('/enable/:ids', ensureLoggedIn(), (req, res) => {
  res.promise(userService.enable(String(req.params.ids).split(',').map(Number)));
});
router.post('/disable/:ids', ensureLoggedIn(), (req, res) => {
  res.promise(userService.disable(String(req.params.ids).split(',').map(Number)));
});

router.get('/archived', ensureLoggedIn(), (req, res) => {
  res.promise(userService.getArchived());
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
  res.promise(userService.getAll());
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
  res.promise(userService.labSearch(String(req.query.name), String(req.query.city), Number(req.query.user_id)));
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
