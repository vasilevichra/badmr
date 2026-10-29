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
import AchievementService from '../services/achievement.ts';
const achievementService = new AchievementService();
import GroupService from '../services/group.ts';
const groupService = new GroupService();
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

const stats = (tournamentId?: number) => ({
  seconds_per_point_current: formatSeconds(matchService.getMedianSecondsPerPointCurrent(tournamentId)),
  seconds_per_point_all: formatSeconds(matchService.getMedianSecondsPerPoint()),
  game_seconds_current: formatSeconds(matchService.getMedianGameSecondsCurrent(tournamentId)),
  game_seconds_all: formatSeconds(matchService.getMedianGameSeconds()),
  match_seconds_current: formatSeconds(matchService.getMedianMatchSecondsCurrent(tournamentId)),
  match_seconds_all: formatSeconds(matchService.getMedianMatchSeconds()),
  games_per_match_current: formatAvg(matchService.getAverageGamesPerMatchCurrent(tournamentId)),
  games_per_match_all: formatAvg(matchService.getAverageGamesPerMatch()),
});

const renderTournamentPage = (
    req: Express.Request,
    res: Express.Response,
    t: { id: number; tournament_type_id: number } | undefined
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
        playerNameFormatter: (id: number, name: string, sex: number, pic: string | null) => share.playerNameFormatter(id, name, sex, pic, (req as unknown as { useragent?: { isMobile?: boolean } }).useragent?.isMobile || false)
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

      res.redirect(`/tournament/${t.id}`);
    }
);

router.get(
    '/tournament/:id',
    (req, res) => {
      res.locals.filter = null;

      renderTournamentPage(req, res, tournamentService.getById(Number(req.params.id)) as { id: number; tournament_type_id: number } | undefined);
    }
);

export default router;
