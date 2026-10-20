import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import UnitService from '../services/unit.ts';
const unitService = new UnitService();

router.get('/', ensureLoggedIn(), (req, res) => {
  res.promise(unitService.getAll());
});

export default router;
