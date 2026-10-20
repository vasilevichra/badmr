import Express from 'express';
const router = Express.Router();
import RatingService from '../services/rating.ts';
const ratingService = new RatingService();

router.get('/:id', (req, res) => {
  res.promise(ratingService.getByUserId(Number(req.params.id)));
});

export default router;
