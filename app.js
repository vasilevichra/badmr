require('use-strict')
const cookieParser = require('cookie-parser');
const cors = require('cors');
// const csrf = require('csurf');
const createError = require('http-errors');
const express = require('express');
const LocalStrategy = require('passport-local');
const logger = require('morgan');
const passport = require('passport');
const promiseMiddleware = require('./src/middleware/promise');
const session = require('express-session');

const SQLiteStore = require('connect-sqlite3')(session);

const app = express();

app.set('views', './src/public/views');
app.set('view engine', 'ejs');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(promiseMiddleware());
app.use(express.static('./src/public'));
app.use(logger('dev'));
app.use(session({
  secret: 'keyboard cat',
  resave: false, // don't save session if unmodified
  saveUninitialized: false, // don't create session until something stored
  store: new SQLiteStore({ db: 'sessions.db'})
}));
// app.use(csrf({ cookie: true }));
app.use(passport.authenticate('session'));
app.use((req, res, next) => {
  const messages = req.session.messages || [];
  res.locals.messages = messages;
  res.locals.hasMessages = !! messages.length;
  req.session.messages = [];
  next();
});
app.use((req, res, next) => {
  res.locals.csrfToken = req.cookies._csrf;
  next();
});

app.use('/', require('./src/routes/index'));
app.use('/api/common', require('./src/routes/common'));
app.use('/api/courts', require('./src/routes/court'));
app.use('/api/games', require('./src/routes/game'));
app.use('/api/matches', require('./src/routes/match'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/tournaments', require('./src/routes/tournament'));
app.use('/api/users', require('./src/routes/user'));
app.use('/api/auth', require('./src/routes/auth'));

app.use((req, res, next) => {
  res.promise(Promise.reject(createError(404)));
});
app.use((err, req, res, next) => {
  // set locals, only providing error in dev mode
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'dev' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
