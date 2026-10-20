import Express from 'express';
const router = Express.Router();
import RegionService from '../services/region.ts';
const regionService = new RegionService();

router.get('/select/:state_id', (req, res) => {
  res.promise({results: regionService.select(Number(req.params.state_id))});
});
router.get('/select', (req, res) => {
  res.promise({results: regionService.select()});
});
router.get('/:id', (req, res) => {
  res.promise(regionService.getById(Number(req.params.id)));
});

export default router;
