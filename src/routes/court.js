const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const CourtService = require('../services/court'), courtService = new CourtService();

router.get('/', ensureLoggedIn, (req, res) => {
  res.promise(courtService.getAll());
});

router.get('/:id', ensureLoggedIn, (req, res) => {
  res.promise(courtService.getById(req.params.id));
});

router.post('/enable', ensureLoggedIn, (req, res) => {
  res.promise(courtService.enableAll());
});

router.post('/enable/:number', ensureLoggedIn, (req, res) => {
  res.promise(courtService.enable(req.params.number));
});

router.post('/disable', ensureLoggedIn, (req, res) => {
  res.promise(courtService.disableAll());
});

router.post('/disable/:number', ensureLoggedIn, (req, res) => {
  res.promise(courtService.disable(req.params.number));
});

module.exports = router;
