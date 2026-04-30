const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const RatingService = require('../services/rating'), ratingService = new RatingService();

router.get('/:id', (req, res) => {
  res.promise(ratingService.getByUserId(req.params.id));
});

module.exports = router;
