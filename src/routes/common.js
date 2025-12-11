const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn();
const CommonService = require('../services/common'), commonService = new CommonService();

router.get('/ready/', ensureLoggedIn, (req, res) => {
  res.promise(commonService.ready());
});

module.exports = router;