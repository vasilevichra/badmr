require('use-strict')
const cors = require('cors')
const createError = require('http-errors');
const express = require('express');
const cookieParser = require('cookie-parser');
const promiseMiddleware = require('./src/middleware/promise');

const app = express();

app.use(cors())
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(promiseMiddleware());
app.use(express.static('./src/public'));

app.use('/api/common', require('./src/routes/common'));
app.use('/api/courts', require('./src/routes/court'));
app.use('/api/games', require('./src/routes/game'));
app.use('/api/matches', require('./src/routes/match'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/tournaments', require('./src/routes/tournament'));
app.use('/api/users', require('./src/routes/user'));

app.use(function (req, res, next) {
  res.promise(Promise.reject(createError(404)));
});
app.use(function (err, req, res, next) {
  res.promise(Promise.reject(err));
});

module.exports = app;