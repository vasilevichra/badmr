import Express from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import crypto from 'crypto';
import DB from '../repositories/common.ts';
import CommonService from '../services/common.ts';
import OAuthService from '../services/oauth.ts';
import UserService from '../services/user.ts';
import { ensureLoggedIn } from 'connect-ensure-login';
const commonService = new CommonService();
const userService = new UserService();
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
  res.render('login', {device: commonService.device(req), vkEnabled: oauthService.configured()});
});

router.post('/login/password', passport.authenticate('local', {
  successReturnToOrRedirect: '/',
  failureRedirect: '/api/auth/login',
  failureMessage: true
}));

router.get('/signup', (req, res) => {
  res.render('signup', { kind: 'page', device: commonService.device(req), vkEnabled: oauthService.configured() });
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

// ——— Вход/привязка через VK ID ———

const oauthService = new OAuthService();

interface SessionLike {
  messages?: string[];
  oauth?: unknown;
}

/** flash-сообщение на странице входа — механизм sess.messages из app.ts. */
const flash = (res: Express.Response, message: string) => {
  const sess = res.req.session as unknown as SessionLike;
  sess.messages = [...(sess.messages ?? []), message];
  res.redirect('/api/auth/login');
};

/** Логин существующим passport-механизмом: serializeUser хранит {id, username}. */
const loginAs = (
    req: Express.Request,
    res: Express.Response,
    next: Express.NextFunction,
    id: number,
    username: string | null
) => {
  req.login({id, username} as unknown as { id: number; username: string | null }, err => {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
};

router.get('/vk', (req, res) => {
  if (!oauthService.configured()) {
    return flash(res, 'Вход через VK сейчас недоступен');
  }
  const intent = req.user ? 'bind' : 'login';
  res.redirect(oauthService.startAuth(req.session as unknown as Record<string, unknown>, intent));
});

router.get('/vk/callback', async (req, res, next) => {
  // intent живёт в сессии, которую handleCallback очищает — читаем до вызова
  const intentRaw = (req.session as unknown as SessionLike).oauth as { intent?: string } | undefined;
  const bind = intentRaw?.intent === 'bind' && Boolean(req.user);

  let profile;
  try {
    profile = await oauthService.handleCallback(req as unknown as Parameters<typeof oauthService.handleCallback>[0]);
  } catch (err) {
    return flash(res, (err as Error).message);
  }

  if (bind) {
    // чужая привязка не перезаписывается: сначала конфликт vk_id с другими,
    // потом уже собственная существующая привязка (idempotent-принцип)
    const foreign = userService.getByVkId(profile.vkId);
    if (foreign && foreign.id !== (req.user as { id: number }).id) {
      return flash(res, 'Этот VK уже привязан к другому аккаунту');
    }
    const id = (req.user as { id: number }).id;
    const current = db.get<{ vk_id: string | null }>('SELECT vk_id FROM user WHERE id = ?', [id]);
    if (current?.vk_id) {
      return flash(res, 'VK уже привязан');
    }
    await userService.setVk(id, profile.vkId);
    return res.redirect('/');
  }

  const linked = userService.getByVkId(profile.vkId);
  if (linked) {
    const row = db.get<{ email: string | null }>('SELECT email FROM user WHERE id = ?', [linked.id]);
    return loginAs(req, res, next, linked.id, row?.email ?? null);
  }

  // автопривязка: ровно один уникальный пользователь по подтверждённым контактам
  const matches = userService.getContactsMatches(profile.email, profile.phone);
  const unique = [...new Set(matches.map(m => m.id))];
  if (unique.length === 1) {
    const id = unique[0];
    const row = db.get<{ email: string | null }>('SELECT email FROM user WHERE id = ?', [id]);
    await userService.setVk(id, profile.vkId);
    return loginAs(req, res, next, id, row?.email ?? null);
  }

  return flash(res, 'Этот VK не привязан: войдите почтой и привяжите в карточке игрока');
});

router.post('/vk/unbind', ensureLoggedIn(), (req, res) => {
  const id = (req.user as { id: number }).id;
  res.promise(userService.setVk(id, null));
});

export default router;
