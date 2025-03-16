const Express = require('express');
// const csrf = require('csurf');
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn;
const UserService = require('../services/user');

const ensureLoggedIn = ensureLogIn();
const router = Express.Router();
const userService = new UserService();

// const csrfProtection = csrf({ cookie: true });
// const parseForm = Express.urlencoded({ extended: false });

router.get('/archived', (req, res) => {
  res.promise(userService.getArchived());
});

router.post('/archive/:id', (req, res) => {
  res.promise(userService.archive(req.params.id));
});

router.post('/archive', (req, res) => {
  res.promise(userService.archiveAll());
});

router.post('/unarchive/:id', (req, res) => {
  res.promise(userService.unarchive(req.params.id));
});

router.post('/unarchive', (req, res) => {
  res.promise(userService.unarchiveAll());
});

router.get('/', (req, res) => {
  res.promise(userService.getAll());
});

router.get('/:id', (req, res) => {
  res.promise(userService.getById(req.params.id));
});

router.post('/register', ensureLoggedIn, (req, res) => {
  res.promise(userService.registerAll());
});

router.post('/register/:id', ensureLoggedIn, (req, res) => {
  res.promise(userService.registerById(req.params.id));
});

router.post('/deregister', ensureLoggedIn, (req, res) => {
  res.promise(userService.deregisterAll());
});

router.post('/deregister/:id', ensureLoggedIn, (req, res) => {
  res.promise(userService.deregisterById(req.params.id));
});

module.exports = router;