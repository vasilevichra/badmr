import AchievementRepository from '../repositories/achievement.ts';
import SettingsService from './settings.ts';

interface AchievementUser {
  user_id: number;
  name: string;
  sex: number;
  pic: string;
}

interface Nomination {
  value: number;
  users: AchievementUser[];
}

interface AchievementUserRow {
  user_id: number;
  lastname: string;
  firstname: string;
  sex: number;
  pic: string;
  match_wins: number;
  match_losses: number;
  match_trier: number;
  points: number;
  iron_nerves: number;
  minutes: number;
}

class Achievement {
  declare static _instance: Achievement | undefined;
  achievement!: AchievementRepository;
  settingsService!: SettingsService;

  constructor() {
    if (Achievement._instance) {
      return Achievement._instance;
    }
    Achievement._instance = this;

    this.achievement = new AchievementRepository();
    this.settingsService = new SettingsService();
  }

  private static toUser = (row: AchievementUserRow): AchievementUser => ({
    user_id: row.user_id,
    name: `${row.lastname} ${row.firstname}`,
    sex: row.sex,
    pic: row.pic
  });

  // игроки с максимальным значением показателя (партнёры по команде всегда равны)
  private static leaders = (rows: AchievementUserRow[], value: (row: AchievementUserRow) => number): Nomination | undefined => {
    const max = Math.max(...rows.map(value));
    if (max <= 0) {
      return undefined;
    }
    const best = rows.filter((row) => value(row) === max);
    return { value: max, users: best.map(Achievement.toUser) };
  };

  /**
   * Номинации раздела «Достижения» по завершённым матчам турнира:
   *  - winner — больше всех выигранных матчей;
   *  - machine_gunner — больше всех забитых воланов (очков);
   *  - trier — больше всех проигранных матчей с перевесом по очкам;
   *  - iron_nerves — больше всех выигранных игр со счётом >= game_point + 1;
   *  - turtle — больше всех минут в играх;
   *  - medalist — больше всех номинаций.
   */
  getByTournament = (tournament_id: number): Record<string, Nomination> => {
    const rows = this.achievement.getStatsByTournament(
        tournament_id,
        Number(this.settingsService.get('max_point')),
        Number(this.settingsService.get('game_point'))
    );
    if (rows.length === 0) {
      return {};
    }

    const nominations = {
      winner: Achievement.leaders(rows, (row) => row.match_wins),
      machine_gunner: Achievement.leaders(rows, (row) => row.points),
      trier: Achievement.leaders(rows, (row) => row.match_trier),
      iron_nerves: Achievement.leaders(rows, (row) => row.iron_nerves),
      turtle: Achievement.leaders(rows, (row) => row.minutes)
    };

    // Медалист — игрок, лидирующий в наибольшем числе номинаций
    const counts = new Map<number, number>();
    for (const nomination of Object.values(nominations)) {
      for (const user of nomination?.users ?? []) {
        counts.set(user.user_id, (counts.get(user.user_id) ?? 0) + 1);
      }
    }
    const max = Math.max(0, ...counts.values());
    if (max > 0) {
      nominations.medalist = {
        value: max,
        users: rows.filter((row) => counts.get(row.user_id) === max).map(Achievement.toUser)
      };
    }

    return Object.fromEntries(Object.entries(nominations).filter(([, nomination]) => nomination));
  };
}

export default Achievement;
