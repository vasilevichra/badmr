const Express = require('express'), router = Express.Router();
// const csrf = require('csurf');
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const UserService = require('../services/user'), userService = new UserService();

// const csrfProtection = csrf({ cookie: true });
// const parseForm = Express.urlencoded({ extended: false });

router.get('/find', (req, res) => {
  res.promise(userService.findBy(req.query.lastname, req.query.firstname, req.query.patronymic));
});

router.post('/enable/:ids', ensureLoggedIn, (req, res) => {
  res.promise(userService.enable(req.params.ids.split(',').map(Number)));
});
router.post('/disable/:ids', ensureLoggedIn, (req, res) => {
  res.promise(userService.disable(req.params.ids.split(',').map(Number)));
});

router.get('/archived', ensureLoggedIn, (req, res) => {
  res.promise(userService.getArchived());
});

router.post('/archive/:id', ensureLoggedIn, (req, res) => {
  res.promise(userService.archive(req.params.id));
});

router.post('/archive', ensureLoggedIn, (req, res) => {
  res.promise(userService.archiveAll());
});

router.post('/unarchive/:id', ensureLoggedIn, (req, res) => {
  res.promise(userService.unarchive(req.params.id));
});

router.post('/unarchive', ensureLoggedIn, (req, res) => {
  res.promise(userService.unarchiveAll());
});

router.get('/', (req, res) => {
  res.promise(userService.getAll());
});

router.post('/create', (req, res) => {
  const {ln, fn, pn, rate, sex, city, bd, tel, mail} = req.body;
  const userSex = sex === 'on' ? 1 : 0;
  res.promise(userService.create(ln, fn, pn, rate, userSex, city, bd, tel, mail));
});

router.get('/select/:city_id', ensureLoggedIn, (req, res) => {
  res.promise(userService.select(req.params.city_id).then(g => ({results: g})));
});

router.get('/:id', (req, res) => {
  res.promise(userService.getById(req.params.id));
});

router.post('/register/:ids', (req, res) => {
  res.promise(userService.registerByIds(req.params.ids.split(',').map(Number)));
});

router.post('/deregister/:ids', ensureLoggedIn, (req, res) => {
  res.promise(userService.deregisterByIds(req.params.ids.split(',').map(Number)));
});

router.get('/registered/:id', (req, res) => {
  res.promise(userService.isRegistered(req.params.id));
});

router.post('/actualize', ensureLoggedIn, (req, res) => {
  res.promise(userService.actualize());
});

router.get('/rating/:id', (req, res) => {
  res.promise(userService.getRating(req.params.id));
});

router.post('/rating/:id', ensureLoggedIn, (req, res) => {
  res.promise(userService.setRating(req.params.id, req.query.new));
});

router.get('/lab/search', (req, res) => {
  res.promise(userService.labSearch(req.query.name, req.query.city, req.query.user_id));
});

router.post('/lab', (req, res) => {
  res.promise(userService.labCrawl());
});

module.exports = router;
