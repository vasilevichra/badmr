import Express from 'express';
const router = Express.Router();
import CommonService from '../services/common.ts';
const commonService = new CommonService();
import SettingsService from '../services/settings.ts';
const settingsService = new SettingsService();
import TournamentService from '../services/tournament.ts';
const tournamentService = new TournamentService();
import UnitService from '../services/unit.ts';
const unitService = new UnitService();
import MatchService from '../services/match.ts';
const matchService = new MatchService();
import StatsService from '../services/stats.ts';
const statsService = new StatsService();
import AchievementService from '../services/achievement.ts';
const achievementService = new AchievementService();
import GroupService from '../services/group.ts';
const groupService = new GroupService();
import TeamOrderService from '../services/team-order.ts';
const teamOrderService = new TeamOrderService();
import share from '../share.cjs';

/** «95.3» → «1м 35с», «51.2» → «51с», без данных → «—». */
const formatSeconds = (value: number | null): string => {
  if (value === null) return '—';
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}м ${total % 60}с` : `${total}с`;
};

/** «2.33» → «2,3», «2» → «2», без данных → «—». */
const formatAvg = (value: number | null): string =>
  value === null ? '—' : String(Math.round(value * 10) / 10).replace('.', ',');

/** Число или «—» без данных. */
const formatNum = (value: number | null): string => value === null ? '—' : String(value);

/** Доля в процентах: «94%(15)» — округлённый процент от общего числа игроков
 *  и абсолютное число новичков в скобках; без игроков → «—». */
const formatPct = (part: number, total: number): string =>
    total === 0 ? '—' : `${Math.round(part / total * 100)}%(${part})`;

const stats = (tournamentId?: number) => {
  const wins = Number(settingsService.get('wins', tournamentId) ?? 2);
  const cities = statsService.cities(tournamentId);
  const participants = statsService.participants(tournamentId);
  const avgRating = statsService.avgRating(tournamentId);
  const newcomers = statsService.newcomers(tournamentId);
  const games = statsService.games(tournamentId);
  const matches = statsService.matches(tournamentId);
  const longestGame = statsService.longestGameSeconds(tournamentId);
  const longestMatch = statsService.longestMatchSeconds(tournamentId);
  const delta = statsService.ratingDelta(tournamentId);
  const winrate = statsService.topWinrate(tournamentId);
  const capacityFill = statsService.capacityFillSeconds(tournamentId);
  return {
    seconds_per_point_current: formatSeconds(matchService.getMeanSecondsPerPointCurrent(tournamentId)),
    seconds_per_point_all: formatSeconds(matchService.getMeanSecondsPerPoint()),
    game_seconds_current: formatSeconds(matchService.getMeanGameSecondsCurrent(tournamentId)),
    game_seconds_all: formatSeconds(matchService.getMeanGameSeconds()),
    match_seconds_current: formatSeconds(matchService.getMeanMatchSecondsCurrent(tournamentId)),
    match_seconds_all: formatSeconds(matchService.getMeanMatchSeconds()),
    games_per_match_current: formatAvg(matchService.getAverageGamesPerMatchCurrent(tournamentId)),
    games_per_match_all: formatAvg(statsService.avgGamesPerMatchAll(tournamentId)),
    // «Игр в матче (2-3)»: матчи длятся от wins до 2×wins−1 игр
    games_in_match_wins: wins,
    cities_current: formatNum(cities.current),
    cities_all: formatNum(cities.all),
    participants_current: formatNum(participants.current),
    participants_all: formatNum(participants.all),
    avg_rating_current: formatAvg(avgRating.current),
    avg_rating_all: formatAvg(avgRating.all),
    // «Новичков, %»: процент (новичков / всего игроков)
    newcomers_current: formatPct(newcomers.current, participants.current),
    newcomers_all: formatPct(newcomers.all, participants.all),
    games_current: formatNum(games.current),
    games_all: formatNum(games.all),
    matches_current: formatNum(matches.current),
    matches_all: formatNum(matches.all),
    longest_game_current: formatSeconds(longestGame.current),
    longest_game_all: formatSeconds(longestGame.all),
    longest_match_current: formatSeconds(longestMatch.current),
    longest_match_all: formatSeconds(longestMatch.all),
    rating_delta_rise_current: formatNum(delta.riseCurrent),
    rating_delta_rise_all: formatNum(delta.riseAll),
    rating_delta_fall_current: formatNum(delta.fallCurrent),
    rating_delta_fall_all: formatNum(delta.fallAll),
    winrate_current: winrate.current === null ? '—' : `${winrate.current}%`,
    winrate_all: winrate.all === null ? '—' : `${winrate.all}%`,
    capacity_fill_current: formatSeconds(capacityFill.current),
    capacity_fill_all: formatSeconds(capacityFill.all),
  };
};

const renderTournamentPage = (
    req: Express.Request,
    res: Express.Response,
    t: { id: number; tournament_type_id: number; tournament_status_id: number } | undefined
) => {
  const useragent = (req as unknown as { useragent?: { isDesktop?: boolean; isTablet?: boolean; isSmartTV?: boolean; isMobile?: boolean } }).useragent;
  const isPhone = () => !(useragent?.isDesktop || useragent?.isTablet || useragent?.isSmartTV) || false;

  if (!t || ![1, 2].includes(t.tournament_type_id)) {
    return res.status(404).render('index', {
      device: commonService.device(req),
      user: req.user,
      ...stats(),
      tournaments: tournamentService.getAll(),
      units: unitService.getAll(),
      registered_count: tournamentService.registeredCount(),
      settings: settingsService.getSettings(),
      timezone: settingsService.getTimezone(),
      tournament_type: 0
    });
  }

  switch (t.tournament_type_id) {
    case 1: // new
    {
      const promises: unknown[] = [
        tournamentService.getAll(),                // 0
        tournamentService.registeredCount(t.id),   // 1
        unitService.getAll(),                      // 2
        settingsService.getDefaults(),             // 3
        settingsService.getSettings(t.id),         // 4
        settingsService.states(t.id),              // 5
        settingsService.regions(t.id),             // 6
        settingsService.cities(t.id),              // 7
        matchService.getAllFinishedAtLastSession(t.id), // 8
        achievementService.getByTournament(t.id)    // 9
      ];
      res.render('index', {
        device: commonService.device(req),
        user: req.user,
        ...stats(t.id),
        tournaments: promises[0],
        tournament: t,
        tournament_id: t.id,
        tournament_type: 1,
        registered_count: promises[1],
        units: promises[2],
        defaults: promises[3],
        settings: promises[4],
        timezone: settingsService.getTimezone(t.id),
        states: promises[5],
        regions: promises[6],
        cities: promises[7],
        matches: promises[8],
        achievements: promises[9],
        achievementMeta: AchievementService.META,
        // параметры редактирования матча из истории (карандаш)
        games_max: 2 * settingsService.get('wins', t.id) - 1,
        game_point: settingsService.get('game_point', t.id),
        max_point: settingsService.get('max_point', t.id),
        playerNameFormatter: (id: number, name: string, sex: number, pic: string | null) => share.playerNameFormatter(id, name, sex, pic, isPhone())
      });
      break;
    }

    case 2: // 110
    {
      const promises: unknown[] = [
        tournamentService.getAll(),                // 0
        unitService.getAll(),                      // 1
        settingsService.states(),                  // 2
        settingsService.regions(),                 // 3
        settingsService.cities(),                  // 4
        groupService.getAll(),                     // 5
        tournamentService.registeredCount(t.id),   // 6
        settingsService.getSettings(t.id)          // 7
      ];
      res.render('index', {
        device: commonService.device(req),
        user: req.user,
        ...stats(),
        tournaments: promises[0],
        tournament: t,
        tournament_id: t.id,
        units: promises[1],
        tournament_type: 2,
        states: promises[2],
        regions: promises[3],
        cities: promises[4],
        groups: promises[5],
        registered_count: promises[6],
        settings: promises[7],
        timezone: settingsService.getTimezone(),
        // отдых команд: с какого момента ждёт каждая (для матрицы игр)
        teamRests: matchService.rests(),
        // аватары табло по разрядам: сеяние команды с фолбэком на сильнейших
        // подходящего пола (для каждой команды групп — один расчёт)
        boardAvatars: Object.values(promises[5] as Record<string, Record<string, Record<string, { team_id: number }[]>>>)
            .flatMap(groupTeams => Object.values(groupTeams))
            .flatMap(teams => Object.values(teams))
            .reduce<Record<number, unknown>>((acc, rows) => {
              if (!(rows[0].team_id in acc)) acc[rows[0].team_id] = teamOrderService.avatars(rows[0].team_id);
              return acc;
            }, {}),
        playerNameFormatter: (id: number, name: string, sex: number, pic: string | null) => share.playerNameFormatter(id, name, sex, pic, (req as unknown as { useragent?: { isMobile?: boolean } }).useragent?.isMobile || false),
        // аватар игрока с фолбэком pepe/pepe-girl (для табло матча)
        playerAvatarFormatter: (pic: string | null, sex: number) => share.playerAvatarFormatter(pic, '', sex)
      });
      break;
    }
  }
};

router.get(
    '/',
    (req, res) => {
      res.locals.filter = null;

      const t = tournamentService.getCurrent() as { id: number } | undefined;
      if (!t) {
        return renderTournamentPage(req, res, undefined);
      }

      res.redirect(`/t/${t.id}`);
    }
);

router.get(
    '/t/:id',
    (req, res) => {
      res.locals.filter = null;

      const t = tournamentService.getById(Number(req.params.id)) as { id: number; tournament_type_id: number; tournament_status_id: number } | undefined;

      // кросс-турнирность: матчи (подбор, живое табло, сохранение через
      // форму) всегда создаются в текущем турнире, а страница показывает
      // свой — идущий (статус 2 «Идёт») не-текущий турнир редиректим на
      // текущий, иначе игроки играют на одной странице, а история
      // появляется на другой. Регистрация (1) и завершённые (3, 4)
      // остаются на своих страницах
      const current = tournamentService.getCurrent() as { id: number } | undefined;
      if (t && t.tournament_status_id === 2 && current && t.id !== current.id) {
        return res.redirect(`/t/${current.id}`);
      }

      renderTournamentPage(req, res, t);
    }
);

// старые ссылки (шера, чаты) живут долго — не рвём их
router.get(
    '/tournament/:id',
    (req, res) => res.redirect(301, `/t/${req.params.id}`)
);

export default router;
