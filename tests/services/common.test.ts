import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { faker } from "@faker-js/faker";
import type { Request } from "express";
import CommonService from "../../src/services/common.ts";
import CourtService from "../../src/services/court.ts";
import GameService from "../../src/services/game.ts";
import MatchService from "../../src/services/match.ts";
import SettingsService from "../../src/services/settings.ts";
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
        // возрастанию, matches по убыванию)
        const expected: Pair = {
          players1: [
            {...player(users[4], ids[4]), matches: 2, played: 1, rating: 500},
            {...player(users[5], ids[5]), matches: 2, played: 1, rating: 460},
          ],
          players2: [
            {...player(users[0], ids[0]), matches: 1, played: 1, rating: 500},
            {...player(users[1], ids[1]), matches: 1, played: 1, rating: 460},
          ],
          diff: 0,
          matches: 6,
          played: 4,
          chance1: 50,
          chance2: 100,
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
            {...player(users[1], ids[1]), matches: 1, played: 1, rating: 460},
          ],
          players2: [
            player(users[5], ids[5]),
            {...player(users[0], ids[0]), matches: 1, played: 1, rating: 500},
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
