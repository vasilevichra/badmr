import cookieParser from 'cookie-parser';
import cors from 'cors';
import csrf from 'csurf';
import createError from 'http-errors';
import express from 'express';
import logger from 'morgan';
import passport from 'passport';
import promiseMiddleware from './src/middleware/promise.ts';
import session from 'express-session';
import useragent from 'express-useragent';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// connect-sqlite3 exports a factory: module.exports = function(connect) => SQLiteStore class bound to session store
const SQLiteStore = ((await import('connect-sqlite3')).default as unknown as (connect: unknown) => new (options: { db: string }) => import('express-session').Store)(session);
const store = new SQLiteStore({ db: '.data/sessions.db' });

app.set('views', './src/public/views');
app.set('view engine', 'ejs');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(promiseMiddleware());

// раздача статики с no-cache: без Cache-Control браузер кэширует эвристически
// и может не ревалидировать вовсе — обновлённые js/css «не подхватывались»
// без Cmd+Shift+R. no-cache разрешает кэш, но требует ревалидацию (ETag, 304).
const assets = (dir: string) => express.static(dir, {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
});

app.use(assets('./src/public'));
app.use(logger('dev'));
app.use(useragent.express());
app.use(session({
  secret: 'keyboard cat',
  resave: false, // don't save session if unmodified
  saveUninitialized: false, // don't create session until something stored
  store: store
}));
app.use(csrf({ cookie: true }));
app.use(passport.initialize());
app.use(passport.authenticate('session'));
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const sess = req.session as unknown as { messages?: string[] };
  const messages = sess.messages || [];
  res.locals.messages = messages;
  res.locals.hasMessages = !!messages.length;
  sess.messages = [];
  next();
});
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  (res.locals as Record<string, unknown>).csrfToken = (req as unknown as { csrfToken: () => string }).csrfToken();
  next();
});

// pushed throw npm frontend dependencies
app.use('/js', assets(path.join(__dirname, '/node_modules/jquery/dist')));
app.use('/js', assets(path.join(__dirname, '/node_modules/jquery.cookie')));
app.use('/js', assets(path.join(__dirname, '/node_modules/jquery.countdown')));
app.use('/js', assets(path.join(__dirname, '/node_modules/bootstrap/dist/js')));
app.use('/js', assets(path.join(__dirname, '/node_modules/bootstrap-table/dist')));
app.use('/js', assets(path.join(__dirname, '/node_modules/express-useragent/dist/browser')));
app.use('/js', assets(path.join(__dirname, '/node_modules/select2/dist/js')));
app.use('/js', assets(path.join(__dirname, '/node_modules/moment/min')));
app.use('/js', assets(path.join(__dirname, '/node_modules/lodash')));
app.use('/js', assets(path.join(__dirname, '/node_modules/chart.js/dist')));
app.use('/js', assets(path.join(__dirname, '/node_modules/chartjs-adapter-moment/dist')));
app.use('/js', assets(path.join(__dirname, '/node_modules/sex-by-russian-name/dist')));
app.get('/js/ejs.js', (req, res) => res.sendFile(path.join(__dirname, '/node_modules/ejs/ejs.min.js')));
app.get('/js/share.js', (req, res) => res.sendFile(path.join(__dirname, '/src/share.cjs')));
app.get('/js/index.js', (req, res) => res.sendFile(path.join(__dirname, '/src/public/js/index.js')));
app.use('/css', assets(path.join(__dirname, '/node_modules/bootstrap/dist/css')));
app.use('/css', assets(path.join(__dirname, '/node_modules/bootstrap-table/dist')));
app.use('/css', assets(path.join(__dirname, '/node_modules/select2/dist/css')));
app.use('/css', assets(path.join(__dirname, '/node_modules/select2-bootstrap-5-theme/dist')));
app.use('/assets', assets(path.join(__dirname, '/src/public/assets')));
app.use('/assets', assets(path.join(__dirname, '/node_modules/bootstrap-icons')));
app.use('/views', assets(path.join(__dirname, '/src/public/views')));

// мутации — только над глобальным current: write-запрос с ?tournament=,
// указывающим на другой турнир, отклоняется (просмотр по ссылке — read-only)
app.use(await import('./src/middleware/tournament-write-guard.ts').then(m => m.default));

app.use('/', await import('./src/routes/index.ts').then(m => m.default));

// todo взять файлы в routes и помапить их ниже, кроме cities

app.use('/api/settings', await import('./src/routes/settings.ts').then(m => m.default));
app.use('/api/common', await import('./src/routes/common.ts').then(m => m.default));
app.use('/api/gyms', await import('./src/routes/gym.ts').then(m => m.default));
app.use('/api/courts', await import('./src/routes/court.ts').then(m => m.default));
app.use('/api/games', await import('./src/routes/game.ts').then(m => m.default));
app.use('/api/matches', await import('./src/routes/match.ts').then(m => m.default));
app.use('/api/tournament-types', await import('./src/routes/tournament-type.ts').then(m => m.default));
app.use('/api/tournaments', await import('./src/routes/tournament.ts').then(m => m.default));
app.use('/api/users', await import('./src/routes/user.ts').then(m => m.default));
app.use('/api/user-clubs', await import('./src/routes/user-club.ts').then(m => m.default));
app.use('/api/ratings', await import('./src/routes/rating.ts').then(m => m.default));
app.use('/api/groups', await import('./src/routes/group.ts').then(m => m.default));
app.use('/api/states', await import('./src/routes/state.ts').then(m => m.default));
app.use('/api/regions', await import('./src/routes/region.ts').then(m => m.default));
app.use('/api/cities', await import('./src/routes/city.ts').then(m => m.default));
app.use('/api/teams', await import('./src/routes/team.ts').then(m => m.default));
app.use('/api/units', await import('./src/routes/unit.ts').then(m => m.default));
app.use('/api/auth', await import('./src/routes/auth.ts').then(m => m.default));
app.use('/api/vk', await import('./src/routes/vk.ts').then(m => m.default));

app.use('/web/players', await import('./src/routes/web/player.ts').then(m => m.default));
app.use('/web/tournaments/new/rules', await import('./src/routes/web/tournaments/new/rules.ts').then(m => m.default));

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  (res as unknown as { promise: (p: unknown) => void }).promise(Promise.reject(createError(404)));
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // set locals, only providing error in dev mode
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'dev' ? err : {};

  // render the error page
  res.status((err as createError.HttpError).status || 500);
  res.render('error');
});

export default app;
