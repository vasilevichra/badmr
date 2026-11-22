import Express from 'express';
const router = Express.Router();
// const csrf = require('csurf');
import { ensureLoggedIn } from 'connect-ensure-login';
import UserService from '../services/user.ts';
import TournamentService from '../services/tournament.ts';
import requestedTournament from '../tournament-request.ts';
const userService = new UserService();
const tournamentService = new TournamentService();

// const csrfProtection = csrf({ cookie: true });
// const parseForm = Express.urlencoded({ extended: false });

router.post('/create', (req, res) => {
  const {ln, fn, pn, sn, account, rate, sex, city, bd, tel, mail} = req.body;
  const userSex = sex === 'on' ? 1 : 0;
  res.promise(userService.create(ln, fn, pn, account ? 1.4 * Number(rate) : rate, userSex, city, bd, sn || null));
});

router.get('/find', (req, res) => {
  // город проведения турнира — для приоритезации вариантов при поиске;
  // сам турнир — для исключения уже зарегистрированных из выдачи
  const tid = requestedTournament(req);
  const tournament = tid ? tournamentService.getById(tid) : tournamentService.getCurrent();
  const city_id = (tournament as { city_id?: number } | undefined)?.city_id;
  res.promise(userService.findBy(String(req.query.lastname), String(req.query.firstname), String(req.query.patronymic), city_id, tid));
});

router.post('/enable/:ids', ensureLoggedIn(), (req, res) => {
  res.promise(userService.enable(String(req.params.ids).split(',').map(Number), requestedTournament(req)));
});
router.post('/disable/:ids', ensureLoggedIn(), (req, res) => {
  res.promise(userService.disable(String(req.params.ids).split(',').map(Number), requestedTournament(req)));
});

router.get('/archived', ensureLoggedIn(), (req, res) => {
  res.promise(userService.getArchived(requestedTournament(req)));
});

router.post('/archive/:id', ensureLoggedIn(), (req, res) => {
  res.promise(userService.archive(Number(req.params.id), requestedTournament(req)));
});

router.post('/archive', ensureLoggedIn(), (req, res) => {
  res.promise(userService.archiveAll(requestedTournament(req)));
});

router.post('/unarchive/:id', ensureLoggedIn(), (req, res) => {
  res.promise(userService.unarchive(Number(req.params.id), requestedTournament(req)));
});

router.post('/unarchive', ensureLoggedIn(), (req, res) => {
  res.promise(userService.unarchiveAll(requestedTournament(req)));
});

router.get('/', (req, res) => {
  res.promise(userService.getAll(requestedTournament(req)));
});

router.get('/select/:city_id', ensureLoggedIn(), (req, res) => {
  res.promise({results: userService.select(Number(req.params.city_id), requestedTournament(req))});
});

router.get('/registered/:id', (req, res) => {
  res.promise(userService.isRegistered(Number(req.params.id), requestedTournament(req)));
});

router.get('/rating/:id', (req, res) => {
  res.promise(userService.getRating(Number(req.params.id)));
});

router.get('/buddies/:id', (req, res) => {
  res.promise(userService.getBuddiesById(Number(req.params.id)));
});

router.get('/lab/search', (req, res) => {
  // поиск по логину badminton4u (@логин в строке регистрации): сначала
  // локальный игрок с такой привязкой (user_lab.site_login), иначе — поиск
  // в лаборатории
  if (req.query.login !== undefined) {
    const login = String(req.query.login);
    const local = userService.getBySiteLogin(login);
    if (local) {
      res.promise(Promise.resolve({status: 'ok', matches: 1, user: local}));
      return;
    }
    res.promise(userService.labSearchByLogin(login, Number(req.query.user_id)));
    return;
  }
  // город турнира (явно указанного ?tournament= либо текущего) — отсекает
  // однофамильцев из других городов; явный ?city= имеет приоритет
  const tid = requestedTournament(req);
  const tournament = tid ? tournamentService.getById(tid) : tournamentService.getCurrent();
  const tournamentCity = (tournament as { city?: string } | undefined)?.city ?? null;
  const city = req.query.city ? String(req.query.city) : tournamentCity;
  res.promise(userService.labSearch(String(req.query.name), city, Number(req.query.user_id)));
});

router.get('/:id', (req, res) => {
  res.promise(userService.getById(Number(req.params.id)));
});

router.post('/register/:ids', (req, res) => {
  res.promise(userService.registerByIds(String(req.params.ids).split(',').map(Number), requestedTournament(req)));
});

router.post('/deregister/:ids', ensureLoggedIn(), (req, res) => {
  res.promise(userService.deregisterByIds(String(req.params.ids).split(',').map(Number), requestedTournament(req)));
});

router.post('/rating/:id', ensureLoggedIn(), (req, res) => {
  res.promise(userService.setRating(Number(req.params.id), Number(req.query.new)));
});

// ФИО из карточки игрока: «Фамилия Имя Отчество» одной строкой,
// отчество — всё, что после первых двух слов (может отсутствовать)
router.post('/name/:id', ensureLoggedIn(), (req, res) => {
  const parts = String(req.body.name || '').trim().split(/\s+/);
  if (parts.length < 2) {
    return res.status(400).json({error: 'нужны минимум фамилия и имя'});
  }
  const [lastname, firstname, ...rest] = parts;
  res.promise(userService.setName(Number(req.params.id), lastname, firstname, rest.length ? rest.join(' ') : null));
});

// дата рождения из карточки игрока редактируется по клику под админом
router.post('/birthday/:id', ensureLoggedIn(), (req, res) => {
  const birthday = String(req.body.birthday || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || isNaN(Date.parse(birthday))) {
    return res.status(400).json({error: 'нужна дата в формате ГГГГ-ММ-ДД'});
  }
  res.promise(userService.setBirthday(Number(req.params.id), birthday));
});

// короткое имя из карточки игрока редактируется по клику под админом;
// пустое значение — сброс (NULL)
router.post('/shortname/:id', ensureLoggedIn(), (req, res) => {
  const shortname = String(req.body.shortname || '').trim();
  if (shortname.length > 30) {
    return res.status(400).json({error: 'короткое имя длиннее 30 символов'});
  }
  res.promise(userService.setShortname(Number(req.params.id), shortname || null));
});

// контакты карточки игрока (почта, VK, Telegram, телефон) — будущие
// идентификаторы входа; пустое значение — сброс (NULL); формат телефона —
// как CHECK в схеме (+79 и 9 цифр), почта — один @ и точка в домене,
// vk/tg — без пробелов и не длиннее 50 (храним как введено)
router.post('/email/:id', ensureLoggedIn(), (req, res) => {
  const email = String(req.body.email || '').trim();
  if (email && (email.length > 100 ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      (email.match(/@/g) ?? []).length !== 1)) {
    return res.status(400).json({error: 'нужен адрес почты вида name@domain.tld'});
  }
  res.promise(userService.setEmail(Number(req.params.id), email || null));
});

router.post('/vk/:id', ensureLoggedIn(), (req, res) => {
  const vk = String(req.body.vk || '').trim();
  if (/\s/.test(vk) || vk.length > 50) {
    return res.status(400).json({error: 'VK id — без пробелов, до 50 символов'});
  }
  res.promise(userService.setVk(Number(req.params.id), vk || null));
});

router.post('/tg/:id', ensureLoggedIn(), (req, res) => {
  const tg = String(req.body.tg || '').trim();
  if (/\s/.test(tg) || tg.length > 50) {
    return res.status(400).json({error: 'Telegram id — без пробелов, до 50 символов'});
  }
  res.promise(userService.setTg(Number(req.params.id), tg || null));
});

router.post('/phone/:id', ensureLoggedIn(), (req, res) => {
  const phone = String(req.body.phone || '').trim();
  if (phone && !/^\+79\d{9}$/.test(phone)) {
    return res.status(400).json({error: 'нужен телефон в формате +79XXXXXXXXX'});
  }
  res.promise(userService.setPhone(Number(req.params.id), phone || null));
});

router.post('/lab', (req, res) => {
  // краул идёт в фоне — ответ не ждёт обхода (он может длиться минуты),
  // иначе браузер абортит запрос и таблица висит «идёт загрузка»
  void userService.labCrawlBackground(requestedTournament(req));
  res.promise(Promise.resolve());
});

export default router;
