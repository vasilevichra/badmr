import Express from 'express';
const router = Express.Router();
import CityService from '../services/city.ts';
const cityService = new CityService();

router.get('/select/:region_id', (req, res) => {
  res.promise({results: cityService.select(Number(req.params.region_id))});
});

router.get('/select', (req, res) => {
  res.promise({results: cityService.select()});
});

router.get('/find', (req, res) => {
  res.promise(cityService.findByName(String(req.query.name)));
});

router.get('/team/:id', (req, res) => {
  res.promise(cityService.getByTeamId(Number(req.params.id)));
});

router.get('/:id', (req, res) => {
  res.promise(cityService.getById(Number(req.params.id)));
});

export default router;
