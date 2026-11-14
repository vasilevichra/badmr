import Express from 'express';
const router = Express.Router();
import GroupService from '../services/group.ts';
import requestedTournament from '../tournament-request.ts';
const groupService = new GroupService();

router.get('/', (req, res) => {
  res.promise(groupService.getAll(requestedTournament(req)));
});

router.get('/select', (req, res) => {
  res.promise({results: groupService.select()});
});

export default router;
