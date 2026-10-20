import Express from 'express';
const router = Express.Router();
import ReadyPriorityService from '../services/ready-priority.ts';
const readyPriorityService = new ReadyPriorityService();
router.get('/select', (req, res) => {
  res.promise({results: readyPriorityService.select()});
});

export default router;
