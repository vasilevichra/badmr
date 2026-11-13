import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import TournamentService from '../services/tournament.ts';
import requestedTournament from '../tournament-request.ts';
const tournamentService = new TournamentService();
import moment from 'moment';

router.post('/current/:id', ensureLoggedIn(), (req, res) => {
  res.promise(tournamentService.setCurrent(Number(req.params.id)));
});

router.get('/current/', (req, res) => {
  res.promise(tournamentService.getCurrent());
});

router.get('/paid/:id', ensureLoggedIn(), (req, res) => {
  res.promise(tournamentService.isEveryonePaid(Number(req.params.id)));
});

router.get('/paid/', (req, res) => {
  res.promise(tournamentService.isEveryonePaid(requestedTournament(req)));
});

router.get('/played/:id', (req, res) => {
  res.promise(tournamentService.hasGames(Number(req.params.id)));
});

router.get('/played/', (req, res) => {
  res.promise(tournamentService.hasGames(requestedTournament(req)));
});

router.post('/pay/:user_id', ensureLoggedIn(), (req, res) => {
  // 0 или 1 — валидные значения; пусто/мусор/отсутствие параметра — платёж по умолчанию (1)
  const paid = req.query.paid === '0' ? 0 : req.query.paid === '1' ? 1 : 1;
  res.promise(tournamentService.pay(Number(req.params.user_id), paid));
});

router.get('/registered/count', (req, res) => {
  res.promise(tournamentService.registeredCount(requestedTournament(req)));
});

router.post('/status/:status_id', ensureLoggedIn(), (req, res) => {
  res.promise(tournamentService.setStatus(Number(req.params.status_id)));
});

// название из шапки (hero) редактируется по клику под админом
router.post('/name/:id', ensureLoggedIn(), (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({error: 'название не может быть пустым'});
  }
  res.promise(tournamentService.setName(Number(req.params.id), name));
});

router.get('/:id', (req, res) => {
  res.promise(tournamentService.getById(Number(req.params.id)));
});

router.get('/', (req, res) => {
  res.promise(tournamentService.getAll());
});

router.post('/create', ensureLoggedIn(), (req, res) => {
  const {user, club, gym, type, name, reg, start, end, cap, courts, rmin, rmax, rules, cur,
         matches, wins, game_point, max_point, fee, calibration_matches, calibration_days} = req.body;
  const toUTC = (dateString: string) => moment(new Date(dateString)).utc().format('YYYY-MM-DD HH:mm:ss');
  const current = cur === 'on' ? 1 : 0;
  res.promise(() => {
    // норма матчей против длины калибровочной серии; то же ограничение
    // на уровне БД (триггеры), но проверяем заранее: create пишет
    // настройки после транзакции — нарушение оставило бы полусозданный турнир
    const matchesNum = Number(matches);
    const calibrationNum = Number(calibration_matches);
    if (matchesNum > 0 && matchesNum <= calibrationNum) {
      throw new Error('Норма матчей должна быть больше длины калибровочной серии или равна 0');
    }
    return tournamentService.create(
        Number(user),
        Number(club),
        Number(gym),
        Number(type),
        name,
        toUTC(reg),
        toUTC(start),
        toUTC(end),
        Number(cap),
        Number(courts),
        rmin ? String(rmin) : '',
        rmax ? String(rmax) : '',
        rules ? String(rules) : '',
        current,
        undefined,
        {matches, wins, game_point, max_point, fee, calibration_matches, calibration_days}
    );
  });
});

export default router;