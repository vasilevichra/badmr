import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import { faker } from "@faker-js/faker";
import Express, { type Express as App } from "express";
import CommonRouter from "../../src/routes/common.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import CourtService from "../../src/services/court.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";
import type { AddressInfo } from "node:net";

interface TestUser {
  rating: number;
  lastname: string;
  firstname: string;
}

interface Player {
  name: string;
  user_id: number;
  rating: number;
  matches: number;
  played: number;
  // исход последнего матча: 1 - выиграл, 0 - проиграл, null - не играл
  won: number | null;
  // выигранные матчи на турнире
  wins: number;
  sex: number;
  pic: string | null;
}

interface Pair {
  players1: Player[];
  players2: Player[];
  diff: number;
  matches: number;
  played: number;
}

const app: App = Express();
app.use(Express.json());
app.use(promiseMiddleware());
app.use((req, _res, next) => {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: number } }).user = { id: 1 };
  next();
});
app.use("/api/common", CommonRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/common`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const users: TestUser[] = [
  { rating: 500, lastname: faker.person.lastName(), firstname: faker.person.firstName() },
  { rating: 460, lastname: faker.person.lastName(), firstname: faker.person.firstName() },
  { rating: 500, lastname: faker.person.lastName(), firstname: faker.person.firstName() },
  { rating: 460, lastname: faker.person.lastName(), firstname: faker.person.firstName() },
];

const fullName = (u: TestUser): string => `${u.lastname} ${u.firstname}`;

// создаёт пользователей, выставляет рейтинги и регистрирует только их
// на текущий турнир (в сиде уже есть пользователи с id 1-127 и их регистрации);
// возвращает id созданных пользователей
const seedReadyUsers = async (ratings: number[]): Promise<number[]> => {
  const userService = new UserService();
  const ids: number[] = [];
  for (let i = 0; i < ratings.length; i++) {
    const user = await userService.create(
      users[i].lastname,
      users[i].firstname,
      faker.person.middleName(),
      ratings[i],
      1,
      1,
      faker.date.birthdate().toISOString().slice(0, 10)
    );
    ids.push(user!.id);
  }
  await userService.deregisterAll();
  await userService.registerByIds(ids);
  return ids;
};

describe("Common routes", () => {
  beforeEach(async () => {
    console.log = function () {};
    await clean();
  });

  describe("GET /ready/", () => {
    it("должен вернуть пустой список когда нет зарегистрированных игроков", async () => {
      // в сиде текущий турнир уже содержит регистрации — убираем их
      await new UserService().deregisterAll();

      const res = await fetch(`${base}/ready/`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await res.json(), []);
    });

    it("должен вернуть пустой список когда нет доступных кортов", async () => {
      await seedReadyUsers(users.map((u) => u.rating));
      await new CourtService().deleteAll();

      const res = await fetch(`${base}/ready/`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await res.json(), []);
    });

    it("должен вернуть пару с минимальной разницей рейтингов", async () => {
      const ids = await seedReadyUsers(users.map((u) => u.rating));

      const res = await fetch(`${base}/ready/`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual<Pair[]>(await res.json(), [
        {
          players1: [
            { name: fullName(users[0]), user_id: ids[0], rating: 500, matches: 0, played: 0, won: null, wins: 0, sex: 1, pic: null },
            { name: fullName(users[1]), user_id: ids[1], rating: 460, matches: 0, played: 0, won: null, wins: 0, sex: 1, pic: null },
          ],
          players2: [
            { name: fullName(users[2]), user_id: ids[2], rating: 500, matches: 0, played: 0, won: null, wins: 0, sex: 1, pic: null },
            { name: fullName(users[3]), user_id: ids[3], rating: 460, matches: 0, played: 0, won: null, wins: 0, sex: 1, pic: null },
          ],
          diff: 0,
          matches: 0,
          played: 0,
          chance1: null,
          chance2: null,
          friends: 0,
        },
      ]);
    });
  });
});
