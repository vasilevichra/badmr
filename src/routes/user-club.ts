import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import UserClubService from '../services/user-club.ts';
const userClubService = new UserClubService();

router.get('/select/', ensureLoggedIn(), (req, res) => {
  res.promise({results: userClubService.select()});
});

export default router;
