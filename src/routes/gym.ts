import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import GymService from '../services/gym.ts';
const gymService = new GymService();

router.get('/select/:user_club_id', ensureLoggedIn(), (req, res) => {
  res.promise({results: gymService.select(Number(req.params.user_club_id))});
});

export default router;
