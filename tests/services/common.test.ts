import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { faker } from "@faker-js/faker";
import type { Request } from "express";
import CommonService from "../../src/services/common.ts";
import CourtService from "../../src/services/court.ts";
import GameService from "../../src/services/game.ts";
import MatchService from "../../src/services/match.ts";
import SettingsService from "../../src/services/settings.ts";
import TournamentService from "../../src/services/tournament.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";

interface TestUser {
  id: number;
  lastname: string;
  firstname: string;
  rating: number;
}

interface Player {
  matches: number;
  played: number;
  // исход последнего матча: 1 - выиграл, 0 - проиграл,
  // null - не играл (в предыдущем матче отдыхал)
  won: number | null;
  // выигранные матчи на турнире
  wins: number;
  name: string;
  rating: number;
  user_id: number;
  sex: number;
  pic: string | null;
}

interface Pair {
  players1: [Player, Player];
  players2: [Player, Player];
  diff: number;
  matches: number;
  played: number;
  // «Шанс» — винрейт совместных доигранных матчей пары в процентах
  // (null — вместе не играли); friends — сумма шансов обеих пар,
  // метрика friends-приоритета
  chance1: number | null;
  chance2: number | null;
  friends: number;
  // система 50%: фаворит матчапа по моментуму — 1 (players1), 2 (players2),
  // 0 (нейтральный); поле появляется в ответе только при включённой fifty
  favorite?: 0 | 1 | 2;
}

interface ReadyCase {
  title: string;
  users: TestUser[];
  courts: number;
  pairs: Pair[];
}

const commonService = new CommonService();

// повторное создание сервиса должно вернуть существующий singleton
const sameService = new CommonService();

const cleanAll = async (): Promise<void> => {
  await clean();
  // сидированные пользователи зарегистрированы в текущем турнире,
  // убираем их регистрации, чтобы ready() видел только игроков теста
  await new UserService().deregisterAll();
};

// создаёт пользователей и регистрирует в турнире только их (по реальным id),
// registerAll нельзя: он регистрирует и сидированных пользователей
const createAndRegister = async (userService: UserService, users: TestUser[]): Promise<number[]> => {
  const ids: number[] = [];
  for (const u of users) {
    const res = await userService.create(
      u.lastname,
      u.firstname,
      faker.person.middleName(),
      1,
      1,
      1,
      faker.date.birthdate().toISOString().slice(0, 10)
    );
    const id = res.id as number;
    ids.push(id);
    await userService.setRating(id, u.rating);
  }
  await userService.registerByIds(ids);
  return ids;
};

// подставляет реальные id созданных пользователей в ожидаемый результат
const withIds = (pairs: Pair[], ids: number[]): Pair[] =>
  pairs.map((p) => ({
    ...p,
    players1: p.players1.map((pl) => ({ ...pl, user_id: ids[pl.user_id - 1] })),
    players2: p.players2.map((pl) => ({ ...pl, user_id: ids[pl.user_id - 1] })),
  }));

const mkUser = (id: number, rating: number): TestUser => ({
  id,
  lastname: faker.person.lastName(),
  firstname: faker.person.firstName(),
  rating,
});

// рейтинги подобраны так, чтобы при proc=10 отношения внутри пар
// укладывались в ограничение: максимальный рейтинг пары не более чем на
// 10% выше среднего, т.е. max/min <= 1.2222
const user_1 = mkUser(1, 500);
const user_2 = mkUser(2, 460);
const user_3 = mkUser(3, 500);
const user_4 = mkUser(4, 420);
const user_5 = mkUser(5, 460);
const user_6 = mkUser(6, 300);
const user_7 = mkUser(7, 460);
const user_8 = mkUser(8, 420);
const user_9 = mkUser(9, 300);
const user_10 = mkUser(10, 560);

const player = (u: TestUser, userId: number): Player => ({
  matches: 0,
  played: 0,
  won: null,
  wins: 0,
  name: `${u.lastname} ${u.firstname}`,
  rating: u.rating,
  user_id: userId,
  // createAndRegister регистрирует с sex=1; user_pic/user_lab у тестовых
  // пользователей нет — аватара нет
  sex: 1,
  pic: null,
});

// игрок, сыгравший один завершённый матч (для тестов priority)
const playedPlayer = (u: TestUser, userId: number, rating: number): Player => ({
  ...player(u, userId),
  rating,
  matches: 1,
  played: 1,
  won: 1,
  wins: 1,
});

const pair = (
  p11: TestUser, p12: TestUser, p21: TestUser, p22: TestUser,
  ids: [number, number, number, number],
  diff: number,
): Pair => ({
  players1: [player(p11, ids[0]), player(p12, ids[1])],
  players2: [player(p21, ids[2]), player(p22, ids[3])],
  diff,
  matches: 0,
  played: 0,
  chance1: null,
  chance2: null,
  friends: 0,
});

describe("Common", () => {
  beforeEach(async () => {
    console.log = function () {};
    await cleanAll();
    // готовность пар в тестах посчитана при фиксированном K —
    // калибровка здесь не тестируется, отключаем её
    const settingsService = new SettingsService();
    await settingsService.set("calibration_matches", "0");
    // порядок подбора фиксирован (played, matches, diff): тесты проверяют
    // логику подбора, а не дефолт приоритетов (в миграциях — diff, matches, played)
    await settingsService.set(settingsService.opt.PRIORITY, "1,2,3");
    // fifty включён по умолчанию (сид миграций): базовые тесты подбора
    // проверяют логику без фильтра 50% — выключаем явно; fifty-тесты
    // включают настройку сами
    await settingsService.set(settingsService.opt.FIFTY, "0");
  });

  describe("constructor", () => {
    it("должен вернуть существующий экземпляр при повторном создании", () => {
      assert.strictEqual(sameService, commonService);
    });
  });

  describe("device", () => {
    const req = (useragent?: { isMobile?: boolean }) =>
      ({ useragent }) as unknown as Request;

    it("должен вернуть phone для мобильного устройства", () => {
      assert.strictEqual(commonService.device(req({ isMobile: true })), "phone");
    });

    it("должен вернуть desktop для десктопного устройства", () => {
      assert.strictEqual(commonService.device(req({ isMobile: false })), "desktop");
    });

    it("должен вернуть desktop когда user agent отсутствует", () => {
      assert.strictEqual(commonService.device(req()), "desktop");
      assert.strictEqual(commonService.device(req({})), "desktop");
    });
  });

  describe("ready", () => {
    describe("должен находить пары", () => {
      // рейтинги 500/460/400/280: единственный допустимый матч — 500+280
      // против 460+400 (разница 80)
      const diffUsers = [mkUser(1, 500), mkUser(2, 460), mkUser(3, 400), mkUser(4, 280)];
      // чередование 500/460: после первого матча остаток тоже парится
      const eightUsers = [
        mkUser(1, 500), mkUser(2, 460), mkUser(3, 500), mkUser(4, 460),
        mkUser(5, 500), mkUser(6, 460), mkUser(7, 500), mkUser(8, 460),
      ];
      const tenUsers = eightUsers.concat([mkUser(9, 300), mkUser(10, 560)]);

      const cases: ReadyCase[] = [
        {
          title: "нет разницы в рейтинге",
          users: [user_1, user_2, user_3, user_5],
          courts: 1,
          pairs: [pair(user_1, user_2, user_3, user_5, [1, 2, 3, 4], 0)],
        },
        {
          title: "разница в рейтинге 80 (в допустимых границах)",
          // единственная комбинация в пределах дельты: 500+280 против 460+400;
          // 970/680 = 290 и 900/780 = 120 превышают дельту 100
          users: diffUsers,
          courts: 1,
          pairs: [pair(diffUsers[0], diffUsers[3], diffUsers[1], diffUsers[2], [1, 4, 2, 3], 80)],
        },
        {
          title: "лучший подбор",
          users: [user_1, user_2, user_3, user_4, user_5, user_6, user_7, user_8],
          courts: 1,
          pairs: [pair(user_1, user_2, user_3, user_5, [1, 2, 3, 5], 0)],
        },
        {
          title: "единственно возможный подбор",
          users: [user_1, user_2, user_3, user_4, user_5, user_6],
          courts: 2,
          pairs: [pair(user_1, user_2, user_3, user_5, [1, 2, 3, 5], 0)],
        },
        {
          title: "выбор из всех возможных",
          users: eightUsers,
          courts: 2,
          pairs: [
            pair(eightUsers[0], eightUsers[1], eightUsers[2], eightUsers[3], [1, 2, 3, 4], 0),
            pair(eightUsers[4], eightUsers[5], eightUsers[6], eightUsers[7], [5, 6, 7, 8], 0),
          ],
        },
        {
          title: "выбор из всех возможных",
          users: tenUsers,
          courts: 2,
          pairs: [
            pair(tenUsers[0], tenUsers[1], tenUsers[2], tenUsers[3], [1, 2, 3, 4], 0),
            pair(tenUsers[4], tenUsers[5], tenUsers[6], tenUsers[7], [5, 6, 7, 8], 0),
          ],
        },
      ];

      cases.forEach((data: ReadyCase) =>
        it(`где ${data.title} [ игр:${data.pairs.length}, кортов:${data.courts}, игроков:${data.users.length} ]`, async () => {
          // сидировано 3 доступных корта текущего турнира — задаём точное число
          const courtService = new CourtService();
          await courtService.disableAll();
          for (let i = 0; i < data.courts; i++) {
            await courtService.create();
          }

          const ids = await createAndRegister(new UserService(), data.users);

          assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), withIds(data.pairs, ids));
        })
      );

      it("должен отклонять пару когда рейтинг превышает средний больше чем на proc", async () => {
        const settingsService = new SettingsService();
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();
        await settingsService.set(settingsService.opt.PROC, "10");

        await createAndRegister(new UserService(), [
          mkUser(1, 500),
          mkUser(2, 450),
          mkUser(3, 450),
          mkUser(4, 350),
        ]);

        // единственный кандидат по дельте — 500+350 против 450+450
        // (разница 50), но 500 превышает среднее пары 425 на 17.6% > 10%
        assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), []);
      });

      it("не должен применять ограничение когда proc = 0", async () => {
        const settingsService = new SettingsService();
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();
        // proc = 0 отключает проверку: пара 500/350 (превышение 42.9%)
        // становится допустимой
        await settingsService.set(settingsService.opt.PROC, "0");

        const users = [
          mkUser(1, 500),
          mkUser(2, 450),
          mkUser(3, 450),
          mkUser(4, 350),
        ];
        const ids = await createAndRegister(new UserService(), users);

        // дельта турнира = 100: 500+350 против 450+450 — разница 50
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          withIds([pair(users[0], users[3], users[1], users[2], [1, 4, 2, 3], 50)], ids),
        );
      });

      it("должен выбирать ещё не игравших игроков когда played первый в priority", async () => {
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();

        const users = [
          mkUser(1, 530),
          mkUser(2, 480),
          mkUser(3, 510),
          mkUser(4, 480),
          mkUser(5, 500),
          mkUser(6, 510),
          mkUser(7, 490),
          mkUser(8, 470),
        ];
        const ids = await createAndRegister(new UserService(), users);
        // u5-u8 сыграли завершённый матч (команда u7/u8 победила):
        // у них matches = 1, played = 1; корт освобождается триггером
        const match = await new MatchService().create(ids[4], ids[5], ids[6], ids[7]);
        const gameService = new GameService();
        await gameService.create(match.id, "15", null, "2026-01-01 10:00:00");
        await gameService.create(match.id, "17", null, "2026-01-01 10:05:00");

        // played-приоритет: выбираются игроки без игры в предыдущем матче,
        // хотя у кандидатов с игравшими разница сумм минимальна
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          withIds([pair(users[0], users[1], users[2], users[3], [1, 2, 3, 4], 20)], ids),
        );
      });

      it("должен выставлять won по исходу последнего матча", async () => {
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();
        const userService = new UserService();

        const users = [
          mkUser(1, 500),
          mkUser(2, 460),
          mkUser(3, 500),
          mkUser(4, 460),
        ];
        const ids = await createAndRegister(userService, users);
        // (u1,u2) против (u3,u4): оба гейма проиграла сторона 1 — матч
        // выиграла сторона 2 (u3,u4); корт освобождается триггером
        const matchId = (await new MatchService().create(ids[0], ids[1], ids[2], ids[3])).id as number;
        const gameService = new GameService();
        await gameService.create(matchId, "15", null, "2026-01-01 10:00:00");
        await gameService.create(matchId, "15", null, "2026-01-01 10:05:00");
        // рейтинги выставляются заново — ожидания не зависят от
        // пересчёта рейтингов историей матча
        for (const [i, rating] of [[0, 500], [1, 460], [2, 520], [3, 480]] as const) {
          await userService.setRating(ids[i], rating);
        }

        // все играли (played = 1), matches равны — решает diff:
        // нулевая разница сумм у (u1,u4) против (u2,u3);
        // won — исход последнего (здесь единственного) матча игрока
        const expected: Pair = {
          players1: [
            {...player(users[0], ids[0]), matches: 1, played: 1, rating: 500, won: 0, wins: 0},
            {...player(users[3], ids[3]), matches: 1, played: 1, rating: 480, won: 1, wins: 1},
          ],
          players2: [
            {...player(users[1], ids[1]), matches: 1, played: 1, rating: 460, won: 0, wins: 0},
            {...player(users[2], ids[2]), matches: 1, played: 1, rating: 520, won: 1, wins: 1},
          ],
          diff: 0,
          matches: 4,
          played: 4,
          // в истории матч играли (u1,u2) и (u3,u4) — выбранные кросс-пары
          // (u1,u4) и (u2,u3) вместе не играли
          chance1: null,
          chance2: null,
          friends: 0,
        };
        assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), [expected]);
      });

      it("должен исключать игроков с незавершённым матчем", async () => {
        const courtService = new CourtService();
        await courtService.disableAll();
        // два корта: первый займёт незавершённый матч, второй свободен
        await courtService.create();
        await courtService.create();

        const users = [
          mkUser(1, 500), mkUser(2, 460), mkUser(3, 500), mkUser(4, 460),
          mkUser(5, 500), mkUser(6, 460), mkUser(7, 500), mkUser(8, 460),
        ];
        const ids = await createAndRegister(new UserService(), users);
        // u1-u4 начали матч, который ещё не завершён
        await new MatchService().create(ids[0], ids[1], ids[2], ids[3]);

        // играющие u1-u4 в ready не попадают; пара составляется из u5-u8
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          withIds([pair(users[4], users[5], users[6], users[7], [5, 6, 7, 8], 0)], ids),
        );
      });

      it("не должен учитывать корты и матчи других турниров в played", async () => {
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();
        await courtService.create();
        const userService = new UserService();

        const users = [
          mkUser(1, 500), mkUser(2, 460), mkUser(3, 500), mkUser(4, 460),
          mkUser(5, 500), mkUser(6, 460), mkUser(7, 500), mkUser(8, 460),
        ];
        const ids = await createAndRegister(new UserService(), users);
        // в первом турнире сыграли матч: u1,u2 победили u3,u4
        const matchId = (await new MatchService().create(ids[0], ids[1], ids[2], ids[3])).id as number;
        const gameService = new GameService();
        await gameService.create(matchId, null, "15", "2026-01-01 10:00:00");
        await gameService.create(matchId, null, "15", "2026-01-01 10:05:00");
        // рейтинги выставляются заново — ожидания не зависят от пересчёта
        // рейтингов историей матча
        for (const [i, rating] of [[0, 500], [1, 460], [2, 500], [3, 460],
          [4, 500], [5, 460], [6, 500], [7, 460]] as const) {
          await userService.setRating(ids[i], rating);
        }

        // переключаемся на второй турнир: матчей в нём нет, корт один;
        // корты первого остаются available = 1 — без фильтра по турниру
        // они завышают окно played, и матч первого турнира помечает
        // u1-u4 как игравших
        await new TournamentService().setCurrent(2);
        // гасим сид-корты второго турнира и создаём один свой
        await courtService.disableAll();
        await courtService.create();
        await userService.registerByIds(ids);
        const settingsService = new SettingsService();
        await settingsService.set("calibration_matches", "0");
        await settingsService.set(settingsService.opt.PRIORITY, "1,2,3");
        // override fifty из beforeEach остался в первом турнире, а второй
        // берёт дефолт из сидов (включён) — выключаем явно, фильтр 50%
        // здесь не тестируется
        await settingsService.set(settingsService.opt.FIFTY, "0");

        // played считается только по матчам текущего турнира (их нет):
        // все отдыхали, пара собирается по diff из всех игроков
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          withIds([{
            ...pair(users[0], users[1], users[2], users[3], [1, 2, 3, 4], 0),
            // (u1,u2) и (u3,u4) вместе играли матч первого турнира:
            // винрейты совместных матчей 100% и 0%
            chance1: 100,
            chance2: 0,
            friends: 100,
          }], ids),
        );
      });

      it("должен применять систему 50%: фаворит подбирает соперников не слабее себя", async () => {
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();
        const settingsService = new SettingsService();
        const userService = new UserService();

        const users = [
          mkUser(1, 560), mkUser(2, 400), // u1,u2 выиграли последний матч
          mkUser(3, 400), mkUser(4, 360), // u3,u4 — оба проиграли
          mkUser(5, 660), mkUser(6, 400), // u5,u6 — отдыхали
        ];
        const ids = await createAndRegister(new UserService(), users);
        // в последнем матче u1,u2 победили u3,u4
        const matchId = (await new MatchService().create(ids[0], ids[1], ids[2], ids[3])).id as number;
        const gameService = new GameService();
        await gameService.create(matchId, null, "15", "2026-01-01 10:00:00");
        await gameService.create(matchId, null, "15", "2026-01-01 10:05:00");
        // рейтинги выставляются заново — ожидания не зависят от пересчёта
        // рейтингов историей матча
        for (const [i, rating] of [[0, 560], [1, 400], [2, 400], [3, 360],
          [4, 660], [5, 400]] as const) {
          await userService.setRating(ids[i], rating);
        }
        await settingsService.set(settingsService.opt.PRIORITY, "3");
        await settingsService.set(settingsService.opt.DELTA, "150");

        // без системы 50% минимальный diff = 40; первым по перечислению —
        // матчап (u6,u2) против (u3,u4): пара-фаворит (u6,u2) — u2 выиграл
        // последний матч, а соперники — нет — играет вниз (760 < 800)
        const withoutFifty: Pair = {
          ...pair(users[5], users[1], users[2], users[3], [6, 2, 3, 4], 40),
          players1: [
            player(users[5], ids[5]),
            {...player(users[1], ids[1]), matches: 1, played: 1, won: 1, wins: 1},
          ],
          players2: [
            {...player(users[2], ids[2]), matches: 1, played: 1, won: 0},
            {...player(users[3], ids[3]), matches: 1, played: 1, won: 0},
          ],
          matches: 3,
          played: 3,
          // (u3,u4) вместе проиграли последний матч: шанс 0
          chance2: 0,
        };

        await settingsService.set(settingsService.opt.FIFTY, "0");
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          [withoutFifty],
        );

        // система 50% отфильтровывает матчапы, где фаворит играет вниз:
        // остаётся кандидат с тем же diff = 40, где фаворит (u2,u4) —
        // u2 выиграл, а соперники — нет — играет вверх (760 ≤ 800)
        const withFifty: Pair = {
          ...pair(users[5], users[2], users[1], users[3], [6, 3, 2, 4], 40),
          players1: [
            player(users[5], ids[5]),
            {...player(users[2], ids[2]), matches: 1, played: 1, won: 0},
          ],
          players2: [
            {...player(users[1], ids[1]), matches: 1, played: 1, won: 1, wins: 1},
            {...player(users[3], ids[3]), matches: 1, played: 1, won: 0},
          ],
          matches: 3,
          played: 3,
          // фаворит — players2: u1 выиграл последний матч, соперники — нет
          favorite: 2,
        };

        await settingsService.set(settingsService.opt.FIFTY, "1");
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          [withFifty],
        );
      });

      it("должен игнорировать систему 50% когда она отфильтровывает всех кандидатов", async () => {
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();
        const settingsService = new SettingsService();
        const userService = new UserService();

        const users = [
          mkUser(1, 520), mkUser(2, 460), // u1,u2 выиграли последний матч
          mkUser(3, 420), mkUser(4, 380), // u3,u4 — оба проиграли
        ];
        const ids = await createAndRegister(new UserService(), users);
        const matchId = (await new MatchService().create(ids[0], ids[1], ids[2], ids[3])).id as number;
        const gameService = new GameService();
        await gameService.create(matchId, null, "15", "2026-01-01 10:00:00");
        await gameService.create(matchId, null, "15", "2026-01-01 10:05:00");
        for (const [i, rating] of [[0, 520], [1, 460], [2, 420], [3, 380]] as const) {
          await userService.setRating(ids[i], rating);
        }
        await settingsService.set(settingsService.opt.PRIORITY, "3");
        await settingsService.set(settingsService.opt.DELTA, "250");
        // proc отсекает кросс-пары с фаворитом (520 против 420/380:
        // превышение среднего больше 8%), оставляя единственный кандидат
        await settingsService.set(settingsService.opt.PROC, "8");

        // единственный кандидат неправильный: фаворит (u1,u2) играет вниз
        // (800 < 980) — система 50% не должна блокировать подбор вовсе,
        // настройка игнорируется и пара всё равно рассчитывается
        const expected: Pair = {
          players1: [
            {...player(users[0], ids[0]), matches: 1, played: 1, won: 1, wins: 1},
            {...player(users[1], ids[1]), matches: 1, played: 1, won: 1, wins: 1},
          ],
          players2: [
            {...player(users[2], ids[2]), matches: 1, played: 1, won: 0},
            {...player(users[3], ids[3]), matches: 1, played: 1, won: 0},
          ],
          diff: 180,
          matches: 4,
          played: 4,
          // обе пары вместе играли последний матч: (u1,u2) выиграли —
          // шанс 100, (u3,u4) проиграли — 0
          chance1: 100,
          chance2: 0,
          friends: 100,
          // фаворит — players1: оба выиграли последний матч, соперники — нет
          favorite: 1,
        };

        await settingsService.set(settingsService.opt.FIFTY, "1");
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          [expected],
        );
      });

      it("должен определять фаворита по проценту выигранных матчей когда исходы последних матчей равны", async () => {
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();
        const settingsService = new SettingsService();
        const userService = new UserService();

        const users = [
          mkUser(1, 460), mkUser(2, 420), // u1,u2: 2 победы в 3 матчах (67%)
          mkUser(3, 350), mkUser(4, 310), // u3,u4: 1 победа в 1 матче (100%)
          mkUser(5, 190), mkUser(6, 170), // u5,u6: 1 победа в 2 матчах (50%)
          mkUser(7, 20), mkUser(8, 20),   // u7,u8: выиграли последний матч
          mkUser(9, 800), mkUser(10, 800), // u9,u10: проиграли последний матч
        ];
        const ids = await createAndRegister(new UserService(), users);
        const matchService = new MatchService();
        const gameService = new GameService();
        // X1: u3,u4 победили u1,u2
        let matchId = (await matchService.create(ids[2], ids[3], ids[0], ids[1])).id as number;
        await gameService.create(matchId, null, "15", "2026-01-01 10:00:00");
        await gameService.create(matchId, null, "15", "2026-01-01 10:01:00");
        // X2: u1,u2 победили u5,u6
        matchId = (await matchService.create(ids[0], ids[1], ids[4], ids[5])).id as number;
        await gameService.create(matchId, null, "15", "2026-01-01 10:05:00");
        await gameService.create(matchId, null, "15", "2026-01-01 10:06:00");
        // X3: u5,u6 победили u9,u10
        matchId = (await matchService.create(ids[4], ids[5], ids[8], ids[9])).id as number;
        await gameService.create(matchId, null, "15", "2026-01-01 10:10:00");
        await gameService.create(matchId, null, "15", "2026-01-01 10:11:00");
        // X4: u1,u2 победили u7,u8
        matchId = (await matchService.create(ids[0], ids[1], ids[6], ids[7])).id as number;
        await gameService.create(matchId, null, "15", "2026-01-01 10:15:00");
        await gameService.create(matchId, null, "15", "2026-01-01 10:16:00");
        // X5 — последний матч турнира: u7,u8 победили u9,u10
        matchId = (await matchService.create(ids[6], ids[7], ids[8], ids[9])).id as number;
        await gameService.create(matchId, null, "15", "2026-01-01 10:20:00");
        await gameService.create(matchId, null, "15", "2026-01-01 10:21:00");
        // рейтинги выставляются заново — ожидания не зависят от пересчёта
        // рейтингов историей матчей
        for (const [i, rating] of [[0, 460], [1, 420], [2, 350], [3, 310],
          [4, 190], [5, 170], [6, 20], [7, 20], [8, 800], [9, 800]] as const) {
          await userService.setRating(ids[i], rating);
        }
        await settingsService.set(settingsService.opt.PRIORITY, "3");
        await settingsService.set(settingsService.opt.DELTA, "310");
        // proc отсекает кросс-пары (разброс рейтингов внутри любой
        // кросс-пары больше 17%), оставляя пары (u1,u2), (u3,u4), (u5,u6)
        await settingsService.set(settingsService.opt.PROC, "8");

        // без системы 50% минимальный diff = 220: (u1,u2) против (u3,u4)
        const withoutFifty: Pair = {
          players1: [
            {...player(users[0], ids[0]), matches: 3, wins: 2},
            {...player(users[1], ids[1]), matches: 3, wins: 2},
          ],
          players2: [
            {...player(users[2], ids[2]), matches: 1, wins: 1},
            {...player(users[3], ids[3]), matches: 1, wins: 1},
          ],
          diff: 220,
          matches: 8,
          played: 0,
          // (u1,u2) вместе: проиграли X1, выиграли X2 и X4 — 66.67;
          // (u3,u4) вместе: выиграли X1 — 100
          chance1: 66.67,
          chance2: 100,
          // сумма chance1 и chance2 как она считается в ready()
          friends: 66.67 + 100,
        };

        await settingsService.set(settingsService.opt.FIFTY, "0");
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          [withoutFifty],
        );

        // система 50%: в предыдущем матче (X5) играли только u7-u10, у всех
        // пар-кандидатов исход последнего матча не определён — фаворит
        // определяется по турнирной статистике. По количеству побед
        // фаворит (u1,u2): 2 против 1 и 1 — и тогда (u1,u2) играет вниз
        // (880 > 660), единственный правильный матчап — (u5,u6) против
        // (u3,u4). По проценту фаворит (u1,u2) — 100% против 67% и 50% —
        // и он играет вверх (660 ≤ 880): остаётся (u1,u2) против (u3,u4).
        // Игроки сыграли разное число матчей, и прямой подсчёт побед
        // несправедлив: 2 победы из 3 слабее 1 победы из 1
        const withFifty: Pair = {
          players1: [
            {...player(users[0], ids[0]), matches: 3, wins: 2},
            {...player(users[1], ids[1]), matches: 3, wins: 2},
          ],
          players2: [
            {...player(users[2], ids[2]), matches: 1, wins: 1},
            {...player(users[3], ids[3]), matches: 1, wins: 1},
          ],
          diff: 220,
          matches: 8,
          played: 0,
          chance1: 66.67,
          chance2: 100,
          friends: 66.67 + 100,
          // фаворит — players2: винрейт (u3,u4) 100% против 67% у (u1,u2)
          favorite: 2,
        };

        await settingsService.set(settingsService.opt.FIFTY, "1");
        assert.deepStrictEqual<Pair[]>(
          await new CommonService().ready(),
          [withFifty],
        );
      });

      it("должен выбирать минимальную разницу рейтингов когда diff первый в priority", async () => {
        const settingsService = new SettingsService();
        const courtService = new CourtService();
        await courtService.disableAll();
        await courtService.create();
        // 3 - diff, 1 - played, 2 - matches: diff перекрывает played
        await settingsService.set(settingsService.opt.PRIORITY, "3,1,2");

        const users = [
          mkUser(1, 530),
          mkUser(2, 480),
          mkUser(3, 510),
          mkUser(4, 480),
          mkUser(5, 500),
          mkUser(6, 510),
          mkUser(7, 490),
          mkUser(8, 470),
        ];
        const ids = await createAndRegister(new UserService(), users);
        // u5-u8 сыграли завершённый матч (команда u7/u8 победила):
        // у них matches = 1, played = 1; рейтинги меняются на дельту:
        // u5 = 487.5, u6 = 497.5, u7 = 502.5, u8 = 482.5
        const match = await new MatchService().create(ids[4], ids[5], ids[6], ids[7]);
        const gameService = new GameService();
        await gameService.create(match.id, "15", null, "2026-01-01 10:00:00");
        await gameService.create(match.id, "17", null, "2026-01-01 10:05:00");

        // diff-приоритет: выбирается кандидат с нулевой разницей сумм
        // (530+482.5 против 510+502.5), хотя u7 и u8 уже играли
        const expected: Pair = {
          players1: [player(users[0], ids[0]), playedPlayer(users[7], ids[7], 482.5)],
          players2: [player(users[2], ids[2]), playedPlayer(users[6], ids[6], 502.5)],
          diff: 0,
          matches: 2,
          played: 2,
          chance1: null,
          chance2: null,
          friends: 0,
        };
        assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), [expected]);
      });

      it("должен выбирать пару с максимальным совместным винрейтом когда friends первый в priority", async () => {
        const settingsService = new SettingsService();
        const courtService = new CourtService();
        const userService = new UserService();
        const matchService = new MatchService();
        const gameService = new GameService();
        await courtService.disableAll();
        await courtService.create();
        // 4 - friends: только совместный винрейт напарников
        await settingsService.set(settingsService.opt.PRIORITY, "4");
        await settingsService.set(settingsService.opt.DELTA, "40");

        const users = [
          mkUser(1, 500),   // u1, u2 — напарники с винрейтом 100
          mkUser(2, 460),
          mkUser(3, 500),   // u3, u4 — напарники с винрейтом 0
          mkUser(4, 460),
          mkUser(5, 500),   // u5, u6 — винрейт 50 (поражение и победа)
          mkUser(6, 460),
          mkUser(7, 500),   // u7, u8 — винрейт 100, но сумма рейтингов
          mkUser(8, 500),   // выводит их за дельту из кандидатов с (u1,u2)
          mkUser(9, 500),   // u9, u10 — винрейт 0
          mkUser(10, 500),
        ];
        const ids = await createAndRegister(new UserService(), users);
        // история совместных матчей: null во втором аргументе игры —
        // команда 1 не проиграла ни одной игры, "15" у второй — проиграла
        // со счётом 15 (wins = 2 — матч доигран сразу)
        // матч 1: (u1,u2) побеждают (u3,u4)
        const match1 = await matchService.create(ids[0], ids[1], ids[2], ids[3]);
        await gameService.create(match1.id, null, "15", "2026-01-01 10:00:00");
        await gameService.create(match1.id, null, "15", "2026-01-01 10:05:00");
        // матч 2: (u7,u8) побеждают (u5,u6)
        const match2 = await matchService.create(ids[6], ids[7], ids[4], ids[5]);
        await gameService.create(match2.id, null, "15", "2026-01-01 10:10:00");
        await gameService.create(match2.id, null, "15", "2026-01-01 10:15:00");
        // матч 3 (последний — played только у его участников):
        // (u5,u6) побеждают (u9,u10) → винрейт (u5,u6) = 50
        const match3 = await matchService.create(ids[4], ids[5], ids[8], ids[9]);
        await gameService.create(match3.id, null, "15", "2026-01-01 10:20:00");
        await gameService.create(match3.id, null, "15", "2026-01-01 10:25:00");
        // рейтинги выставляются заново — ожидания не зависят от
        // пересчёта рейтингов историей матчей
        for (const [i, rating] of [[0, 500], [1, 460], [2, 500], [3, 460], [4, 500], [5, 460], [6, 750], [7, 300], [8, 600], [9, 400]] as const) {
          await userService.setRating(ids[i], rating);
        }

        // friends-приоритет: уникальный максимум суммы шансов 150 —
        // пары (u5,u6) и (u1,u2); у остальных кандидатов с парой (u1,u2)
        // сумма 100, пары (u7,u8) отсечены дельтой. Порядок пар и игроков
        // внутри них — по перечислению готовых игроков (played по
        // возрастанию, matches по убыванию): u1,u2 отдыхали в последнем
        // матче (played = 0) и перечисляются раньше u5,u6
        const expected: Pair = {
          players1: [
            // won = null: сами они выигрывали матч 1, но последний матч
            // (матч 3) не играли — played = 0
            {...player(users[0], ids[0]), matches: 1, played: 0, rating: 500, won: null, wins: 1},
            {...player(users[1], ids[1]), matches: 1, played: 0, rating: 460, won: null, wins: 1},
          ],
          players2: [
            {...player(users[4], ids[4]), matches: 2, played: 1, rating: 500, won: 1, wins: 1},
            {...player(users[5], ids[5]), matches: 2, played: 1, rating: 460, won: 1, wins: 1},
          ],
          diff: 0,
          matches: 6,
          played: 2,
          chance1: 100,
          chance2: 50,
          friends: 150,
        };
        assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), [expected]);
      });

      it("не должен учитывать совместный винрейт когда diff приоритетнее friends", async () => {
        const settingsService = new SettingsService();
        const courtService = new CourtService();
        const userService = new UserService();
        const matchService = new MatchService();
        const gameService = new GameService();
        await courtService.disableAll();
        await courtService.create();
        // 3 - diff, 4 - friends: diff перекрывает friends
        await settingsService.set(settingsService.opt.PRIORITY, "3,4");
        await settingsService.set(settingsService.opt.DELTA, "40");

        const users = [
          mkUser(1, 500),
          mkUser(2, 460),
          mkUser(3, 500),
          mkUser(4, 460),
          mkUser(5, 520),
          mkUser(6, 480),
        ];
        const ids = await createAndRegister(new UserService(), users);
        // (u1,u2) побеждают (u3,u4): винрейт (u1,u2) = 100
        const match = await matchService.create(ids[0], ids[1], ids[2], ids[3]);
        await gameService.create(match.id, null, "15", "2026-01-01 10:00:00");
        await gameService.create(match.id, null, "15", "2026-01-01 10:05:00");
        for (const [i, rating] of [[0, 500], [1, 460], [2, 470], [3, 450], [4, 520], [5, 480]] as const) {
          await userService.setRating(ids[i], rating);
        }

        // diff-приоритет: кандидат с нулевой разницей сумм (520+460 против
        // 480+500) выбирается, хотя шанс обеих его пар — null; кандидаты
        // с парой (u1,u2) и её шансом 100 имеют разницу 40
        const expected: Pair = {
          players1: [
            player(users[4], ids[4]),
            {...player(users[1], ids[1]), matches: 1, played: 1, rating: 460, won: 1, wins: 1},
          ],
          players2: [
            player(users[5], ids[5]),
            {...player(users[0], ids[0]), matches: 1, played: 1, rating: 500, won: 1, wins: 1},
          ],
          diff: 0,
          matches: 2,
          played: 2,
          chance1: null,
          chance2: null,
          friends: 0,
        };
        assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), [expected]);
      });
    });

    describe("не должен находить пары", () => {
      it("когда нет кортов", async () => {
        await new CourtService().deleteAll();
        assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), []);
      });

      it("когда нет зарегистрированных игроков", async () => {
        assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), []);
      });

      it("когда игроков меньше четырёх", async () => {
        const courtService = new CourtService();
        await courtService.create();

        await createAndRegister(new UserService(), [
          mkUser(0, 500),
          mkUser(0, 500),
          mkUser(0, 500),
        ]);

        assert.deepStrictEqual<Pair[]>(await new CommonService().ready(), []);
      });

      it("когда разница в рейтинге превышает дельту", async () => {
        // дельта турнира = 100; proc = 0 (по умолчанию) ограничение не
        // применяет, но все три комбинации матчей превышают дельту:
        // 800/200 = 600, 750/250 = 500, 650/350 = 300
        await createAndRegister(new UserService(), [
          mkUser(1, 600),
          mkUser(2, 200),
          mkUser(3, 150),
          mkUser(4, 50),
        ]);

        const pairs = await new CommonService().ready();
        assert.deepStrictEqual<Pair[]>(pairs, []);
      });
    });
  });
});
