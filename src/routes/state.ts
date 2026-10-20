import Express from 'express';
const router = Express.Router();
import StateService from '../services/state.ts';
const stateService = new StateService();

router.get('/select/:id', (req, res) => {
  res.promise({results: stateService.select()});
});
router.get('/select', (req, res) => {
  res.promise({results: stateService.select()});
});

router.get('/:id', (req, res) => {
  res.promise(stateService.getById(Number(req.params.id)));
});

export default router;
