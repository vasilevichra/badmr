const Express = require('express');

const router = Express.Router();

router.get(
    '/',
    // (req, res, next) => {
    //   if (!req.user) {
    //     return res.render('home');
    //   }
    //   next();
    // },
    (req, res, next) => {
      res.locals.filter = null;
      res.render('index', {user: req.user});
    }
);

module.exports = router;