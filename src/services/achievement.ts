import AchievementRepository from '../repositories/achievement.ts';
import type { AchievementGameRow } from '../repositories/achievement.ts';
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

interface NominationMeta {
  title: string;
  description: string;
  // класс иконки bootstrap-icons (без префикса "bi bi-") для заголовка
  icon: string;
}

/** Накопленные по игроку показатели из event-строк. */
interface UserStats extends AchievementUser {
  games: number;
  minutes: number;
  points: number;
  match_wins: number;
  match_losses: number;
  trier: number;
  iron_nerves: number;
  endurance: number;
  almost: number;
  rout: number;
  fast_start: number;
  finisher: number;
  comeback: number;
  streak: number;
  partners: Set<number>;
  opp_pairs_won: Set<string>;
  deadline_matches: Set<number>;
}

class Achievement {
  declare static _instance: Achievement | undefined;

  // мета номинаций: название + описание + иконка. Порядок ключей — порядок
  // вывода в разделе «Достижения». Иконки — bootstrap-icons (все есть в
  // подключённом bootstrap-icons.min.css).
  static META: Record<string, NominationMeta> = {
    medalist: { title: "Медалист", description: "Больше всех номинаций", icon: "bi-award-fill" },
    winner: { title: "Победитель", description: "Больше всех выигранных матчей", icon: "bi-trophy-fill" },
    machine_gunner: { title: "Пулемётчик", description: "Больше всех забитых воланов", icon: "bi-crosshair" },
    trier: { title: "Очень старался, но ничего не получилось", description: "Больше всех проигранных матчей с перевесом по забитым очкам", icon: "bi-emoji-frown" },
    unrestrainable: { title: "Неудержимый", description: "Самая длинная серия выигранных игр подряд", icon: "bi-fire" },
    fast_start: { title: "Быстрый старт", description: "Чаще всех выигрывал первую игру матча", icon: "bi-rocket-takeoff-fill" },
    finisher: { title: "Дожиматель", description: "Чаще всех выигрывал решающую игру при счёте 1:1", icon: "bi-hammer" },
    comeback: { title: "Камбэк", description: "Больше всех побед после проигранной первой игры", icon: "bi-arrow-repeat" },
    perfect: { title: "Идеальный сезон", description: "Ни одного поражения при минимум трёх матчах", icon: "bi-patch-check-fill" },
    endurance: { title: "На измор", description: "Больше всех побед со счётом 30:29", icon: "bi-hourglass-split" },
    iron_nerves: { title: "Стальные нервы", description: "Больше всех выигранных игр в дополнительном счёте (22 и больше)", icon: "bi-snow2" },
    almost: { title: "Почти смог", description: "Больше всех проигранных игр со своим счётом 20 и больше", icon: "bi-emoji-dizzy" },
    rout: { title: "Разгром", description: "Больше всех игр, выигранных с разницей 15 очков и больше", icon: "bi-bullseye" },
    duo: { title: "Связка", description: "Пара с наибольшим числом совместных побед", icon: "bi-people-fill" },
    nightmare: { title: "Гроза пар", description: "Больше всех побед над разными парами соперников", icon: "bi-cloud-lightning-fill" },
    universal: { title: "Универсал", description: "Играл с наибольшим числом разных партнёров", icon: "bi-puzzle-fill" },
    workhorse: { title: "Трудяга", description: "Больше всех сыгранных игр", icon: "bi-tools" },
    turtle: { title: "Черепаха", description: "Больше всех минут, проведённых в играх", icon: "bi-clock-history" },
    lightning: { title: "Молния", description: "Самые короткие игры в среднем (минимум три игры)", icon: "bi-lightning-charge-fill" },
    rising_star: { title: "Восходящая звезда", description: "Набрал больше всех рейтинговых очков за турнир", icon: "bi-stars" },
    consistent: { title: "Стабильный", description: "Лучший средний прирост рейтинга за матч (минимум три матча)", icon: "bi-graph-up-arrow" },
    deadline: { title: "Жертва дедлайна", description: "Больше всех матчей в последний час игровой сессии", icon: "bi-alarm-fill" }
  };

  // названия номинаций — единые для раздела «Достижения» и модалки игрока
  static TITLES: Record<string, string> =
    Object.fromEntries(Object.entries(Achievement.META).map(([key, meta]) => [key, meta.title]));

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

  private static toUser = (stats: UserStats): AchievementUser => ({
    user_id: stats.user_id,
    name: stats.name,
    sex: stats.sex,
    pic: stats.pic
  });

  // игроки с максимальным значением показателя (партнёры по команде всегда равны)
  private static leaders = (stats: UserStats[], value: (stats: UserStats) => number): Nomination | undefined => {
    const max = Math.max(...stats.map(value));
    if (max <= 0) {
      return undefined;
    }
    const best = stats.filter((row) => value(row) === max);
    return { value: max, users: best.map(Achievement.toUser) };
  };

  // лидер по минимуму среднего времени игры (Молния) среди игроков
  // с достаточным числом игр
  private static shortest = (stats: UserStats[], minGames: number): Nomination | undefined => {
    const eligible = stats.filter((row) => row.games >= minGames);
    if (eligible.length === 0) {
      return undefined;
    }
    const avg = (row: UserStats) => Math.round(row.minutes / row.games * 10) / 10;
    const min = Math.min(...eligible.map(avg));
    const best = eligible.filter((row) => avg(row) === min);
    return { value: min, users: best.map(Achievement.toUser) };
  };

  /** Связка: пара (отсортированные id) с наибольшим числом совместных
   *  побед — считаются матчи, не игры (обе строки команды дают игру). */
  private static bestDuo = (rows: AchievementGameRow[]): { value: number; userIds: number[] } | undefined => {
    const wins = new Map<string, Set<number>>();
    for (const row of rows) {
      if (!row.win) {
        continue;
      }
      const key = [row.user_id, row.partner_id].sort((a, b) => a - b).join(":");
      if (!wins.has(key)) {
        wins.set(key, new Set());
      }
      wins.get(key)!.add(row.match_id);
    }
    const max = Math.max(0, ...[...wins.values()].map((matches) => matches.size));
    if (max < 2) {
      return undefined;
    }
    const key = [...wins.entries()].filter(([, matches]) => matches.size === max).at(-1)![0];
    return { value: max, userIds: key.split(":").map(Number) };
  };

  /**
   * Номинации раздела «Достижения» по завершённым матчам турнира.
   * Все показатели считаются из event-строк «игрок — игра» и дельт
   * рейтинга; порядок вывода — порядок ключей Achievement.META.
   */
  getByTournament = (tournament_id: number): Record<string, Nomination> => {
    const max_point = Number(this.settingsService.get('max_point'));
    const game_point = Number(this.settingsService.get('game_point'));
    const rows = this.achievement.getGamesByTournament(tournament_id, max_point, game_point);
    if (rows.length === 0) {
      return {};
    }

    const stats = Achievement.accumulate(rows, game_point, max_point);

    const deltas = new Map<number, number>();
    for (const { user_id, delta } of this.achievement.getDeltasByTournament(tournament_id)) {
      deltas.set(user_id, delta);
    }
    const withDelta = (user_id: number) => deltas.get(user_id) ?? 0;

    const duo = Achievement.bestDuo(rows);

    const nominations: Record<string, Nomination | undefined> = {
      winner: Achievement.leaders(stats, (s) => s.match_wins),
      machine_gunner: Achievement.leaders(stats, (s) => s.points),
      trier: Achievement.leaders(stats, (s) => s.trier),
      unrestrainable: Achievement.leaders(stats, (s) => s.streak >= 2 ? s.streak : 0),
      fast_start: Achievement.leaders(stats, (s) => s.fast_start),
      finisher: Achievement.leaders(stats, (s) => s.finisher),
      comeback: Achievement.leaders(stats, (s) => s.comeback),
      perfect: Achievement.leaders(stats, (s) => s.match_losses === 0 && s.match_wins >= 3 ? s.match_wins : 0),
      endurance: Achievement.leaders(stats, (s) => s.endurance),
      iron_nerves: Achievement.leaders(stats, (s) => s.iron_nerves),
      almost: Achievement.leaders(stats, (s) => s.almost),
      rout: Achievement.leaders(stats, (s) => s.rout),
      duo: duo ? {
        value: duo.value,
        users: duo.userIds.map((id) => Achievement.toUser(stats.find((s) => s.user_id === id)!))
      } : undefined,
      nightmare: Achievement.leaders(stats, (s) => s.opp_pairs_won.size),
      universal: Achievement.leaders(stats, (s) => s.partners.size >= 2 ? s.partners.size : 0),
      workhorse: Achievement.leaders(stats, (s) => s.games),
      turtle: Achievement.leaders(stats, (s) => s.minutes),
      lightning: Achievement.shortest(stats, 3),
      rising_star: Achievement.leaders(stats, (s) => Math.max(0, withDelta(s.user_id))),
      consistent: Achievement.leaders(stats, (s) => {
        if (s.match_wins + s.match_losses < 3) {
          return 0;
        }
        return Math.round(withDelta(s.user_id) / (s.match_wins + s.match_losses) * 10) / 10;
      }),
      deadline: Achievement.leaders(stats, (s) => s.deadline_matches.size)
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
        users: stats.filter((s) => counts.get(s.user_id) === max).map(Achievement.toUser)
      };
    }

    // порядок вывода — порядок ключей META
    const ordered: Record<string, Nomination> = {};
    for (const key of Object.keys(Achievement.META)) {
      const nomination = nominations[key];
      if (nomination) {
        ordered[key] = nomination;
      }
    }
    return ordered;
  };

  /** Накапливает показатели игроков из event-строк (строки упорядочены
   *  по user_id, match_created_at, game_id). */
  private static accumulate = (rows: AchievementGameRow[], game_point: number, max_point: number): UserStats[] => {
    const stats = new Map<number, UserStats>();
    const get = (row: AchievementGameRow): UserStats => {
      let s = stats.get(row.user_id);
      if (!s) {
        s = {
          user_id: row.user_id,
          name: `${row.lastname} ${row.firstname}`,
          sex: row.sex,
          pic: row.pic,
          games: 0, minutes: 0, points: 0, match_wins: 0, match_losses: 0,
          trier: 0, iron_nerves: 0, endurance: 0, almost: 0, rout: 0,
          fast_start: 0, finisher: 0, comeback: 0, streak: 0,
          partners: new Set(), opp_pairs_won: new Set(), deadline_matches: new Set()
        };
        stats.set(row.user_id, s);
      }
      return s;
    };

    // игры в разрезе «игрок — матч»: для итогов матча
    const byMatch = new Map<string, AchievementGameRow[]>();
    // текущая серия выигранных игр (строки игрока идут подряд)
    let streakUser: number | null = null;
    let streakRun = 0;

    for (const row of rows) {
      const s = get(row);
      s.games++;
      s.minutes += row.minutes;
      s.points += row.my_score;
      s.partners.add(row.partner_id);
      if (row.deadline) {
        s.deadline_matches.add(row.match_id);
      }
      if (row.win) {
        s.opp_pairs_won.add([row.opp_1_id, row.opp_2_id].sort((a, b) => a - b).join(":"));
        streakRun = s.user_id === streakUser ? streakRun + 1 : 1;
        s.streak = Math.max(s.streak, streakRun);
        streakUser = s.user_id;
      } else {
        streakRun = 0;
        streakUser = s.user_id;
      }
      if (row.game_no === 1 && row.win) {
        s.fast_start++;
      }
      if (row.win && row.my_score >= game_point + 1) {
        s.iron_nerves++;
      }
      if (row.win && row.opp_score === max_point - 1) {
        s.endurance++;
      }
      if (!row.win && row.my_score >= game_point - 1) {
        s.almost++;
      }
      if (row.win && row.my_score - row.opp_score >= 15) {
        s.rout++;
      }

      const key = `${row.user_id}:${row.match_id}`;
      const matchRows = byMatch.get(key);
      if (matchRows) {
        matchRows.push(row);
      } else {
        byMatch.set(key, [row]);
      }
    }

    // итоги по матчам: победы/поражения, очковый перевес в поражении,
    // решающая игра при равном счёте по играм, камбэк
    for (const [key, matchRows] of byMatch) {
      const s = stats.get(Number(key.split(":")[0]))!;
      const myWins = matchRows.filter((r) => r.win).length;
      const matchWon = myWins > matchRows[0].games_total - myWins;
      const matchLost = myWins < matchRows[0].games_total - myWins;
      const first = matchRows.find((r) => r.game_no === 1)!;
      if (matchWon) {
        s.match_wins++;
        if (!first.win) {
          s.comeback++;
        }
      }
      if (matchLost) {
        s.match_losses++;
        const myPoints = matchRows.reduce((sum, r) => sum + r.my_score, 0);
        const oppPoints = matchRows.reduce((sum, r) => sum + r.opp_score, 0);
        if (myPoints > oppPoints) {
          s.trier++;
        }
      }
      // решающая игра: последняя игра матча, до неё счёт по играм равный
      const last = matchRows.at(-1)!;
      const winsBefore = myWins - (last.win ? 1 : 0);
      if (last.game_no === last.games_total && last.win && winsBefore === last.games_total - 1 - winsBefore) {
        s.finisher++;
      }
    }

    return [...stats.values()];
  };

  /**
   * Номинации пользователя в турнире (для модалки игрока): «Медалист» первым,
   * остальные — в порядке объявления. Названия берутся из Achievement.TITLES.
   */
  getNominationsByUser = (user_id: number, tournament_id: number): { icon: string; title: string; description: string }[] => {
    const nominations = this.getByTournament(tournament_id);
    const keys = Object.keys(nominations).filter((key) =>
      nominations[key].users.some((user) => user.user_id === user_id)
    );
    keys.sort((key1, key2) => Number(key2 === "medalist") - Number(key1 === "medalist"));
    return keys.map((key) => ({ icon: Achievement.META[key].icon, title: Achievement.TITLES[key], description: Achievement.META[key].description }));
  };
}

export default Achievement;
