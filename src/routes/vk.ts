import Express from 'express';
const router = Express.Router();
// import { ensureLoggedIn } from 'connect-ensure-login';
import VkService from '../services/vk.ts';
const vkService = new VkService();

router.post('/poll', (req, res) => {
  res.promise(vkService.run());
});

export default router;