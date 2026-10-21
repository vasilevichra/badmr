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
const settingsService = new SettingsService();
import Promise from 'bluebird';
import share from '../../share.cjs';

router.get('/:id', (req, res) => {
  const userId = Number(req.params.id);
  // номинации пользователя — по текущему турниру «Новая Лига»
  const tournament = tournamentService.getCurrent() as { id: number } | undefined;
  const achievements = tournament ? achievementService.getNominationsByUser(userId, tournament.id) : [];
  Promise.all([
    userService.getById(userId),              // 0
    userService.getRating(userId),            // 1
    userService.getDaysUntilBirthday(userId), // 2
    cityService.getByUserId(userId),          // 3
    regionService.getByUserId(userId),        // 4
    stateService.getByUserId(userId),         // 5
    userService.getMatchesCount(userId),      // 6
    userService.getGamesCount(userId),        // 7
    userService.getCoWinnersById(userId),     // 8
    userService.getCoLosersById(userId),      // 9
    userService.getBuddiesById(userId),       // 10
    userService.getWorstOpponentsById(userId), // 11
    matchService.getAllByUser(userId),         // 12
    userService.getCalibration(userId),        // 13
    settingsService.get('calibration_matches'), // 14
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
      achievements: achievements,
      playerNameFormatter: (id: number, name: string, sex: number, pic: string | null) => share.playerNameFormatter(id, name, sex, pic, (req as unknown as { useragent?: { isMobile?: boolean } }).useragent?.isMobile || false)
    });
  });

});

export default router;