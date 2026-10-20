import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import TeamService from '../services/team.ts';
const teamService = new TeamService();
import TeamUserService from '../services/team-user.ts';
const teamUserService = new TeamUserService();
import TeamColorService from '../services/team-color.ts';
const teamColorService = new TeamColorService();
import TeamOrderService from '../services/team-order.ts';
const teamOrderService = new TeamOrderService();

router.get('/colors/select', ensureLoggedIn(), (req, res) => {
  res.promise({results: teamColorService.select()});
});

router.post('/create', ensureLoggedIn(), (req, res) => {
  const {tournament_id, group_id, name, city_id, team_color_id} = req.body;
  res.promise(teamService.create(Number(tournament_id), Number(group_id), name, Number(city_id), Number(team_color_id)));
});

router.post('/users/create', ensureLoggedIn(), (req, res) => {
  const {team_id, user_id, group_id} = req.body;
  res.promise(teamUserService.create(Number(team_id), Number(user_id), Number(group_id)));
});

router.post('/:team_id/users/:user_id', ensureLoggedIn(), (req, res) => {
  res.promise(teamUserService.setGroupId(Number(req.params.team_id), Number(req.params.user_id), Number(req.query.group_id)));
});

router.post('/:team_id/city/:city_id', ensureLoggedIn(), (req, res) => {
  res.promise(teamService.setCity(Number(req.params.team_id), Number(req.params.city_id)));
});

router.post('/:team_id/name', ensureLoggedIn(), (req, res) => {
  res.promise(teamService.setName(Number(req.params.team_id), String(req.query.value)));
});

router.get('/:id/order/:position_number', ensureLoggedIn(), (req, res) => {
  res.promise(teamOrderService.select(Number(req.params.id), Number(req.params.position_number)));
});

router.get('/:team_id/position/:position_number', ensureLoggedIn(), (req, res) => {
  res.promise(teamOrderService.position(Number(req.params.team_id), Number(req.params.position_number)));
});

router.post('/:team_id/order/:position_number', ensureLoggedIn(), (req, res) => {
  res.promise(teamOrderService.set(Number(req.params.team_id), Number(req.params.position_number), Number(req.query.team_user_id)));
});

export default router;
