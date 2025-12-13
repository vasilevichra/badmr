const Express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const crypto = require('crypto');
const DB = require('../repositories/common');
const CommonService = require('../services/common'), commonService = new CommonService();

passport.use(new LocalStrategy((email, password, cb) => {
  new DB().db.database().get('SELECT * FROM user WHERE email = ?', [email], (err, row) => {
    const message = {message: 'Bad credentials.'};
    if (err) {
      return cb(err);
    }
    if (!row) {
      return cb(null, false, message);
    }

    crypto.pbkdf2(password, row.salt, 310000, 32, 'sha256', (err, hashedPassword) => {
      if (err) {
        return cb(err);
      }
      if (!crypto.timingSafeEqual(row.hashed_password, hashedPassword)) {
        return cb(null, false, message);
      }
      return cb(null, row);
    });
  });
}));

passport.serializeUser((user, cb) => {
  process.nextTick(() => {
    cb(null, {id: user.id, username: user.email});
  });
});

passport.deserializeUser((user, cb) => {
  process.nextTick(() => cb(null, user));
});

const router = Express.Router();

router.get('/login', (req, res) => {
  res.render('login', {device: commonService.device(req)});
});

router.post('/login/password', passport.authenticate('local', {
  successReturnToOrRedirect: '/',
  failureRedirect: '/login',
  failureMessage: true
}));

router.get('/signup', (req, res) => {
  res.render('signup', { kind: 'page' });
});

router.post('/signup', (req, res, next) => {
  var salt = crypto.randomBytes(16);
  crypto.pbkdf2(req.body.password, salt, 310000, 32, 'sha256', (err, hashedPassword) => {
    if (err) {
      return next(err);
    }
    // todo сделать регистрацию
    DB().db.run('INSERT INTO user (email, hashed_password, salt) VALUES (?, ?, ?)', [
      req.body.username,
      hashedPassword,
      salt
    ], function (err) {
      if (err) {
        return next(err);
      }
      const user = {
        id: this.lastID,
        username: req.body.username
      };
      req.login(user, err => {
        if (err) {
          return next(err);
        }
        res.redirect('/');
      });
    });
  });
});

router.post('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
});

module.exports = router;
