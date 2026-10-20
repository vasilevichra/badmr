import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import CourtService from '../services/court.ts';
const courtService = new CourtService();

router.get('/', ensureLoggedIn(), (req, res) => {
  res.promise(courtService.getAll());
});

router.get('/:id', ensureLoggedIn(), (req, res) => {
  res.promise(courtService.getById(Number(req.params.id)));
});

router.post('/create', ensureLoggedIn(), (req, res) => {
  res.promise(courtService.create());
});

router.post('/enable', ensureLoggedIn(), (req, res) => {
  res.promise(courtService.enableAll());
});

router.post('/enable/:number', ensureLoggedIn(), (req, res) => {
  res.promise(courtService.enable(Number(req.params.number)));
});

router.post('/disable', ensureLoggedIn(), (req, res) => {
  res.promise(courtService.disableAll());
});

router.post('/disable/:number', ensureLoggedIn(), (req, res) => {
  res.promise(courtService.disable(Number(req.params.number)));
});

router.post('/delete/:id', ensureLoggedIn(), (req, res) => {
  res.promise(courtService.delete(Number(req.params.id)));
});

export default router;
