const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const UnitService = require('../services/unit'), unitService = new UnitService();

router.get('/', ensureLoggedIn, (req, res) => {
  res.promise(unitService.getAll());
});

module.exports = router;
