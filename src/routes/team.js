const Express = require('express'), router = Express.Router();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn, ensureLoggedIn = ensureLogIn({options: {redirectTo: '/api/auth/login'}});
const TeamService = require('../services/team'), teamService = new TeamService();
const TeamUserService = require('../services/team-user'), teamUserService = new TeamUserService();
const TeamColorService = require('../services/team-color'), teamColorService = new TeamColorService();
const TeamOrderService = require('../services/team-order'), teamOrderService = new TeamOrderService();

router.get('/colors/select', ensureLoggedIn, (req, res) => {
  res.promise(teamColorService.select().then(colors => ({results: colors})));
});

router.post('/create', ensureLoggedIn, (req, res) => {
  const {tournament_id, group_id, name, city_id, team_color_id} = req.body;
  res.promise(teamService.create(Number(tournament_id), Number(group_id), name, Number(city_id), Number(team_color_id)));
});

router.post('/users/create', ensureLoggedIn, (req, res) => {
  const {team_id, user_id, group_id} = req.body;
  res.promise(teamUserService.create(Number(team_id), Number(user_id), Number(group_id)));
});

router.post('/:team_id/users/:user_id', ensureLoggedIn, (req, res) => {
  res.promise(teamUserService.setGroupId(Number(req.params.team_id), Number(req.params.user_id), Number(req.query.group_id)));
});

router.post('/:team_id/city/:city_id', ensureLoggedIn, (req, res) => {
  res.promise(teamService.setCity(Number(req.params.team_id), Number(req.params.city_id)));
});

router.post('/:team_id/name', ensureLoggedIn, (req, res) => {
  res.promise(teamService.setCity(Number(req.params.team_id), req.query.value));
});

router.get('/:id/order/:position_number', ensureLoggedIn, (req, res) => {
  res.promise(teamOrderService.select(Number(req.params.id), Number(req.params.position_number)));
});

router.get('/:team_id/position/:position_number', ensureLoggedIn, (req, res) => {
  res.promise(teamOrderService.position(Number(req.params.team_id), Number(req.params.position_number)));
});

router.post('/:team_id/order/:position_number', ensureLoggedIn, (req, res) => {
  res.promise(teamOrderService.set(Number(req.params.team_id), Number(req.params.position_number), Number(req.query.team_user_id)));
});

module.exports = router;
