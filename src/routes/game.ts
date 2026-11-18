import Express from 'express';
const router = Express.Router();
import { ensureLoggedIn } from 'connect-ensure-login';
import GameService from '../services/game.ts';
import MatchService from '../services/match.ts';
import requestedTournament from '../tournament-request.ts';
const gameService = new GameService();
const matchService = new MatchService();

router.get('/current110', (req, res) => {
  res.promise(gameService.getCurrentByTeamIds(Number(req.query.team_1_id), Number(req.query.team_2_id), requestedTournament(req)));
});

// живое табло Новой лиги: текущая игра матча (null — игры ещё нет).
// маршруты объявлены до '/:id', иначе 'current' захватится как id
router.get('/current', (req, res) => {
  res.promise(gameService.getCurrentByMatchId(Number(req.query.match_id)));
});

router.post('/current/increase', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.increaseCurrentByMatchId(Number(req.query.match_id), String(req.query.team_number)));
});

// минус очко — корректировка счёта судьёй (свайп вниз по полю счёта)
router.post('/current/decrease', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.decreaseCurrentByMatchId(Number(req.query.match_id), String(req.query.team_number)));
});

// двойной клик судьи по игроку на 0:0 — задать первого подающего
router.post('/current/serve', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.setCurrentServeByMatchId(Number(req.query.match_id), Number(req.query.user_id)));
});

// свайп судьи по игроку — ручной свап чётности кортов пары
router.post('/current/swap', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.swapCurrentEvenByMatchId(Number(req.query.match_id), String(req.query.team_number)));
});

// счёты матчей 110 турнира со страницы (параметр ?tournament= от
// withTournament; без него — текущий) — для показа в ячейках матрицы:
// финишировавший — только счёт, идущий — счёт и кнопка возобновления
router.get('/110/results', (req, res) => {
  res.promise(gameService.getResults(requestedTournament(req)));
});

// сводная таблица 110 (весь турнир или одна группа)
router.get('/110/standings', (req, res) => {
  const group = req.query.group === undefined ? undefined : Number(req.query.group);
  res.promise(matchService.standings110(requestedTournament(req), group));
});

router.get('/:id', (req, res) => {
  res.promise(gameService.getById(Number(req.params.id)));
});

router.post('/current110/increase', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.increaseCurrentByTeamIds(Number(req.query.team_1_id), Number(req.query.team_2_id), String(req.query.team_number), requestedTournament(req)));
});

// минус очко — корректировка счёта судьёй (свайп вниз по полю счёта)
router.post('/current110/decrease', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.decreaseCurrentByTeamIds(Number(req.query.team_1_id), Number(req.query.team_2_id), String(req.query.team_number), requestedTournament(req)));
});

// подача на 0:0 — тап/двойной клик судьи по чётному игроку пары
router.post('/current110/serve', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.setCurrentServeByTeamIds(Number(req.query.team_1_id), Number(req.query.team_2_id), Number(req.query.user_id), requestedTournament(req)));
});

// свайп судьи по игроку — ручной свап чётности кортов пары.
// team_number валидируем явно: String(undefined) = "undefined" при
// молчаливой коэрсии свапнул бы команду 2
router.post('/current110/swap', ensureLoggedIn(), (req, res) => {
  const teamNumber = req.query.team_number;
  res.promise(teamNumber === "1" || teamNumber === "2"
      ? gameService.swapCurrentEvenByTeamIds(Number(req.query.team_1_id), Number(req.query.team_2_id), teamNumber, requestedTournament(req))
      : null);
});

// смена текущего разряда табло — из колбэка ответа increase (порядок гарантирован)
router.post('/current110/type-pos', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.setTypePosByTeamIds(Number(req.query.team_1_id), Number(req.query.team_2_id), Number(req.query.type_pos), requestedTournament(req)));
});

router.post('/create', ensureLoggedIn(), (req, res) => {
  const {match_id, lost_1_by, lost_2_by, created_at} = req.body;
  res.promise(gameService.create(match_id, lost_1_by || null, lost_2_by || null, created_at));
});

router.post('/update/:id', ensureLoggedIn(), (req, res) => {
  const {lost_1_by, lost_2_by} = req.body;
  res.promise(gameService.update(Number(req.params.id), lost_1_by ?? null, lost_2_by ?? null));
});

router.post('/delete/:id', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.deleteById(Number(req.params.id)));
});

// редактирование матча из истории (карандаш): пачка игр одним запросом —
// обновить изменённые, удалить очищенные, создать новые с экстраполированным
// временем; пересчёт рейтинга — один каскад внутри applyMatchGames
router.post('/bulk/:match_id', ensureLoggedIn(), (req, res) => {
  const games = typeof req.body.games === 'string' ? JSON.parse(req.body.games) : req.body.games;
  res.promise(gameService.applyMatchGames(Number(req.params.match_id), games ?? []));
});

router.post('/create110/:match_110_id', ensureLoggedIn(), (req, res) => {
  res.promise(gameService.create110(Number(req.params.match_110_id)));
});

export default router;