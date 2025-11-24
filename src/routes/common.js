const Express = require('express');
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn;
const CommonService = require('../services/common');

const ensureLoggedIn = ensureLogIn();
const router = Express.Router();
const commonService = new CommonService();

router.get('/ready/', ensureLoggedIn, (req, res) => {
  res.promise(commonService.ready());
});

module.exports = router;