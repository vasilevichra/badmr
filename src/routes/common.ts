import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import CommonService from '../services/common.ts';
const commonService = new CommonService();

router.get('/ready/', ensureLoggedIn(), (req, res) => {
  res.promise(commonService.ready());
});

export default router;