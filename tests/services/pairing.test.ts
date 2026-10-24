import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { faker } from "@faker-js/faker";
import CommonService from "../../src/services/common.ts";
import CourtService from "../../src/services/court.ts";
import GameService from "../../src/services/game.ts";
import MatchService from "../../src/services/match.ts";
import SettingsService from "../../src/services/settings.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";
import {
  fitThreeGameModel,
  threeGameProb,
  type MatchSample,
} from "../../src/services/pairing.ts";

interface TestUser {
  id: number;
  rating: number;
}

const settingsService = new SettingsService();
const commonService = new CommonService();
const courtService = new CourtService();
const userService = new UserService();
const matchService = new MatchService();
const gameService = new GameService();

const cleanAll = async (): Promise<void> => {
  await clean();
  await new UserService().deregisterAll();
};

const mkUser = (rating: number): TestUser => ({id: 0, rating});

const createAndRegister = async (users: TestUser[]): Promise<number[]> => {
  const ids: number[] = [];
  for (const u of users) {
    const res = await userService.create(
      faker.person.lastName(),
      faker.person.firstName(),
      faker.person.middleName(),
      1,
      1,
      1,
      faker.date.birthdate().toISOString().slice(0, 10),
    );
    const id = res.id as number;
    ids.push(id);
    await userService.setRating(id, u.rating);
  }
  await userService.registerByIds(ids);
  return ids;
};

/** Идентифицирует подобранные матчи без привязки к форме ответа:
 *  [[id1, id2], [id3, id4]] на каждый матч. */
const matchup = (pairs: {
  players1: {user_id: number}[];
  players2: {user_id: number}[];
}[]): number[][][] =>
  pairs.map((p) => [
    p.players1.map((x) => x.user_id),
    p.players2.map((x) => x.user_id),
  ]);

/** Создаёт и завершает матч: обе игры проигрывает первая пара. */
const seedMatch = async (
  ids: [number, number, number, number],
  date: string,
): Promise<void> => {
  await matchService.create(...ids);
  const match = (await matchService.getAll() as { id: number }[]).at(-1)!;
  await gameService.create(match.id, "15", null, date);
  await gameService.create(match.id, "15", null, date);
};

describe("Pairing", () => {
  beforeEach(async () => {
    console.log = function () {};
    await cleanAll();
    await settingsService.set("calibration_matches", "0");
    await settingsService.set(settingsService.opt.FIFTY, "0");
    await settingsService.set(settingsService.opt.PROC, "0");
  });

  describe("fitThreeGameModel", () => {
    it("возвращает дефолтную модель пока истории меньше 20 матчей", () => {
      const samples: MatchSample[] = Array.from({length: 19}, () => ({
        avgDiff: 0,
        spread: 0,
        threeGames: 1,
      }));
      assert.deepStrictEqual(fitThreeGameModel(samples), {a: 0, b1: 0.3, b2: 0.3});
    });

    it("дефолтная модель: равные команды без разброса дают P=0.5, P убывает по признакам", () => {
      const model = fitThreeGameModel([]);
      assert.ok(Math.abs(threeGameProb(model, 0, 0) - 0.5) < 1e-9);
      // больше разница средних и разброс внутри пар — меньше трёхигровых
      assert.ok(threeGameProb(model, 0, 0) > threeGameProb(model, 30, 0));
      assert.ok(threeGameProb(model, 0, 0) > threeGameProb(model, 0, 200));
    });

    it("подгоняет модель по истории: P убывает по разнице рейтингов, детерминирована", () => {
      const samples: MatchSample[] = [
        ...Array.from({length: 15}, () => ({avgDiff: 0, spread: 0, threeGames: 1})),
        ...Array.from({length: 15}, () => ({avgDiff: 100, spread: 0, threeGames: 0})),
      ];
      const model = fitThreeGameModel(samples);
      assert.ok(threeGameProb(model, 0, 0) > 0.7);
      assert.ok(threeGameProb(model, 100, 0) < 0.3);
      assert.ok(
        threeGameProb(model, 0, 0) > threeGameProb(model, 50, 0) &&
        threeGameProb(model, 50, 0) > threeGameProb(model, 100, 0),
      );
      assert.deepStrictEqual(fitThreeGameModel(samples), model);
    });
  });

  describe("ready", () => {
    it("оптимизатор раунда находит разбиение лучше жадного посортового выбора", async () => {
      // рейтинги подобраны скриптом: жадный выбор (минимум diff по одному
      // матчу за раз) даёт суммарный diff 90, глобальная оптимизация — 10
      const users = [430, 440, 540, 400, 450, 490, 500, 400].map(mkUser);
      const ids = await createAndRegister(users);
      await courtService.disableAll();
      await courtService.create();
      await courtService.create();
      await settingsService.set(settingsService.opt.DELTA, "100");
      await settingsService.set(settingsService.opt.PRIORITY, "3");

      const pairs = await commonService.ready();
      assert.strictEqual(pairs.length, 2);
      assert.deepStrictEqual(matchup(pairs), [
        [[ids[0], ids[3]], [ids[1], ids[7]]], // 830 vs 840, diff 10
        [[ids[2], ids[4]], [ids[5], ids[6]]], // 990 vs 990, diff 0
      ]);
      assert.deepStrictEqual(pairs.map((p) => p.diff), [10, 0]);
    });

    it("priority rematch: избегает повторных дуо из недавних матчей турнира", async () => {
      const users = [500, 500, 500, 500].map(mkUser);
      const ids = await createAndRegister(users);
      await courtService.disableAll();
      await courtService.create();
      // в последнем матче (u1,u2) победили (u3,u4): оба дуо недавние
      await seedMatch([ids[0], ids[1], ids[2], ids[3]], "2026-01-01 10:00:00");
      await settingsService.set(settingsService.opt.DELTA, "100");
      await settingsService.set(settingsService.opt.PRIORITY, "5");

      const pairs = await commonService.ready();
      assert.strictEqual(pairs.length, 1);
      // риматч (u1,u2) против (u3,u4) — rematch 3 (оба дуо + состав);
      // перегруппировка сохраняет состав целиком: quad даёт rematch 1,
      // но это всё равно минимум среди кандидатов
      assert.deepStrictEqual(matchup(pairs), [
        [[ids[0], ids[2]], [ids[1], ids[3]]],
      ]);
      assert.strictEqual(pairs[0].rematch, 1);
    });

    it("priority balance: при равном diff выбирает матч с меньшим разбросом внутри пар", async () => {
      // (u1,u2) — разброс 200: любой их матч не конкурентен; (u3,u4) и
      // (u5,u6) — разбросы 20 и 10 при diff 0
      const users = [600, 400, 510, 490, 505, 495].map(mkUser);
      const ids = await createAndRegister(users);
      await courtService.disableAll();
      await courtService.create();
      await settingsService.set(settingsService.opt.DELTA, "30");
      await settingsService.set(settingsService.opt.PRIORITY, "6");

      const pairs = await commonService.ready();
      assert.strictEqual(pairs.length, 1);
      assert.deepStrictEqual(matchup(pairs), [
        [[ids[2], ids[3]], [ids[4], ids[5]]],
      ]);
      assert.ok(typeof pairs[0].balance === "number");
      assert.ok(pairs[0].balance! > 0.4, "высокая предсказанная конкурентность");
    });

    it("delta_auto сужает дельту когда последние матчи заканчиваются в две игры", async () => {
      const users = [560, 460, 460, 460].map(mkUser);
      const ids = await createAndRegister(users);
      await courtService.disableAll();
      await courtService.create();
      await settingsService.set(settingsService.opt.DELTA, "100");
      await settingsService.set(settingsService.opt.PRIORITY, "3");
      // любой допустимый матч здесь имеет diff 100 — по дельте проходит
      let pairs = await commonService.ready();
      assert.strictEqual(pairs.length, 1);

      // 20 завершённых матчей 2:0: доля трёхигровых 0% < 30% —
      // дельта сужается до 85, матчи diff 100 перестают допускаться
      for (let i = 0; i < 20; i++) {
        await seedMatch(
          [ids[0], ids[1], ids[2], ids[3]],
          `2026-01-01 10:${String(i).padStart(2, "0")}:00`,
        );
      }
      // рейтинги выставляются заново — ожидания не зависят от пересчёта
      for (const [i, rating] of [[0, 560], [1, 460], [2, 460], [3, 460]] as const) {
        await userService.setRating(ids[i], rating);
      }
      await settingsService.set("delta_auto", "1");
      pairs = await commonService.ready();
      assert.strictEqual(pairs.length, 0);

      // выключили — дельта снова 100, подбор работает
      await settingsService.set("delta_auto", "0");
      pairs = await commonService.ready();
      assert.strictEqual(pairs.length, 1);
      assert.deepStrictEqual(matchup(pairs), [
        [[ids[0], ids[1]], [ids[2], ids[3]]],
      ]);
    });
  });
});
