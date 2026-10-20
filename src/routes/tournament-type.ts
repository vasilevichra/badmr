import Express from 'express';
const router = Express.Router();
import TournamentTypeService from '../services/tournament-type.ts';
const tournamentTypeService = new TournamentTypeService();
router.get('/select', (req, res) => {
  res.promise({results: tournamentTypeService.select()});
});

export default router;