import Express from 'express';
const router = Express.Router();
import UserService from '../../services/user.ts';
const userService = new UserService();
import TournamentService from '../../services/tournament.ts';
const tournamentService = new TournamentService();
import AchievementService from '../../services/achievement.ts';
const achievementService = new AchievementService();
import MatchService from '../../services/match.ts';
const matchService = new MatchService();
import CityService from '../../services/city.ts';
const cityService = new CityService();
import RegionService from '../../services/region.ts';
const regionService = new RegionService();
import StateService from '../../services/state.ts';
const stateService = new StateService();
import SettingsService from '../../services/settings.ts';
import requestedTournament from '../../tournament-request.ts';
const settingsService = new SettingsService();
import Promise from 'bluebird';
import share from '../../share.cjs';

router.get('/:id', (req, res) => {
  const userId = Number(req.params.id);
  // личный просмотр: матчи карточки — по турниру из ?tournament=<id>
  // (ссылки вида /tournament/3?player=1), без параметра — по глобальному current
  const tournamentId = requestedTournament(req);
  // номинации пользователя — по текущему турниру «Новая Лига»
  const tournament = tournamentService.getCurrent() as { id: number } | undefined;
  // «текущий турнир» статистики карточки: турнир просматриваемой страницы,
  // без него — глобальный current; если и его нет — оба среза совпадают
  const currentTournamentId = tournamentId ?? tournament?.id;
  const currentTournament = currentTournamentId !== undefined
    ? tournamentService.getById(currentTournamentId) as { tournament_type_id: number; tournament_status_id: number } | undefined
    : undefined;
  const typeId = currentTournament?.tournament_type_id;
  // калибровка бессмысленна, когда матчи больше не играются:
  // 3 — Завершён, 4 — Отменён
  const currentTournamentFinished = currentTournament !== undefined
    && (currentTournament.tournament_status_id === 3 || currentTournament.tournament_status_id === 4);
  const achievements = tournament ? achievementService.getNominationsByUser(userId, tournament.id) : [];
  Promise.all([
    userService.getById(userId),              // 0
    userService.getRating(userId),            // 1
    userService.getDaysUntilBirthday(userId), // 2
    cityService.getByUserId(userId),          // 3
    regionService.getByUserId(userId),        // 4
    stateService.getByUserId(userId),         // 5
    userService.getMatchesCount(userId, currentTournamentId),      // 6 — на этом турнире
    userService.getGamesCount(userId, currentTournamentId),        // 7
    userService.getCoWinnersById(userId, {tournamentId: currentTournamentId}),  // 8
    userService.getCoLosersById(userId, {tournamentId: currentTournamentId}),   // 9
    userService.getBuddiesById(userId),       // 10
    userService.getWorstOpponentsById(userId), // 11
    matchService.getAllByUser(userId, tournamentId), // 12
    userService.getCalibration(userId),        // 13
    settingsService.get('calibration_matches'), // 14
    userService.getMatchesCount(userId),       // 15 — за всё время
    userService.getGamesCount(userId),         // 16
    userService.getCoWinnersById(userId, {typeId}), // 17 — за всё время, турниры того же типа
    userService.getCoLosersById(userId, {typeId}),  // 18
    typeId !== undefined
      ? matchService.getAllByUserSameType(userId, typeId, currentTournamentId) // 19 — свёрнутые матчи того же типа
      : Promise.resolve([]),
  ])
  .then((promises) => {
    return res.render('modal/player/id', {
      login: req.isAuthenticated() ? req.user : null,
      user: promises[0],
      rating: promises[1],
      days_until_birthday: promises[2],
      city: promises[3],
      region: promises[4],
      state: promises[5],
      matches: promises[6],
      games: promises[7],
      co_winners: promises[8],
      co_losers: promises[9],
      buddies: promises[10],
      worst_opponents: promises[11],
      user_matches: promises[12],
      calibration: promises[13],
      calibration_matches: Number(promises[14]),
      matches_total: promises[15],
      games_total: promises[16],
      co_winners_all: promises[17],
      co_losers_all: promises[18],
      type_matches: promises[19],
      current_tournament_finished: currentTournamentFinished,
      achievements: achievements,
      playerNameFormatter: (id: number, name: string, sex: number, pic: string | null) => share.playerNameFormatter(id, name, sex, pic, (req as unknown as { useragent?: { isMobile?: boolean } }).useragent?.isMobile || false)
    });
  });

});

export default router;