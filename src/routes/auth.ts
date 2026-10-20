import Express from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import crypto from 'crypto';
import DB from '../repositories/common.ts';
import CommonService from '../services/common.ts';
const commonService = new CommonService();
const db = new DB().db;

interface UserRow {
  id: number;
  email: string | null;
  hashed_password: Buffer;
  salt: Buffer;
}

passport.use(new LocalStrategy((email: string, password: string, cb) => {
  const message = {message: 'Bad credentials.'};
  try {
    const row = db.get<UserRow>('SELECT * FROM user WHERE email = ?', [email]);
    if (!row) {
      return cb(null, false, message);
    }

    crypto.pbkdf2(password, row.salt, 310000, 32, 'sha256', (err: Error | null, hashedPassword: Buffer) => {
      if (err) {
        return cb(err);
      }
      if (!crypto.timingSafeEqual(row.hashed_password, hashedPassword)) {
        return cb(null, false, message);
      }
      return cb(null, row);
    });
  } catch (err) {
    return cb(err as Error);
  }
}));

passport.serializeUser((user, cb) => {
  process.nextTick(() => {
    const u = user as unknown as UserRow;
    cb(null, {id: u.id, username: u.email} as unknown as { id: number; username: string | null });
  });
});

passport.deserializeUser((user: unknown, cb) => {
  process.nextTick(() => cb(null, user as { id: number; username: string | null }));
});

const router = Express.Router();

router.get('/login', (req, res) => {
  res.render('login', {device: commonService.device(req)});
});

router.post('/login/password', passport.authenticate('local', {
  successReturnToOrRedirect: '/',
  failureRedirect: '/api/auth/login',
  failureMessage: true
}));

router.get('/signup', (req, res) => {
  res.render('signup', { kind: 'page' });
});

router.post('/signup', (req, res, next) => {
  const salt = crypto.randomBytes(16);
  crypto.pbkdf2(req.body.password, salt, 310000, 32, 'sha256', (err: Error | null, hashedPassword: Buffer) => {
    if (err) {
      return next(err);
    }
    try {
      // todo сделать регистрацию
      const result = db.run('INSERT INTO user (email, hashed_password, salt) VALUES (?, ?, ?)', [
        req.body.username,
        hashedPassword,
        salt
      ]);
      const user = {
        id: result.id,
        username: req.body.username
      };
      req.login(user, err => {
        if (err) {
          return next(err);
        }
        res.redirect('/');
      });
    } catch (insertError) {
      return next(insertError as Error);
    }
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

export default router;
