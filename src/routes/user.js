const Express = require('express'), router = Express.Router();
// const csrf = require('csurf');
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn();
const UserService = require('../services/user'), userService = new UserService();

// const csrfProtection = csrf({ cookie: true });
// const parseForm = Express.urlencoded({ extended: false });

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

router.get('/:id', (req, res) => {
  res.promise(userService.getById(req.params.id));
});

router.post('/register/:ids', ensureLoggedIn, (req, res) => {
  res.promise(userService.registerByIds(req.params.ids.split(',').map(Number)));
});

router.post('/deregister/:ids', ensureLoggedIn, (req, res) => {
  res.promise(userService.deregisterByIds(req.params.ids.split(',').map(Number)));
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

module.exports = router;
