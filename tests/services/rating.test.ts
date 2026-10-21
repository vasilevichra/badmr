import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import RatingService from "../../src/services/rating.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import UserService from "../../src/services/user.ts";
import SettingsService from "../../src/services/settings.ts";
import { clean } from "../helpers/migration.ts";

// точки рейтинга в тестах посчитаны при фиксированном K —
// калибровка здесь не тестируется, отключаем её
const settingsService = new SettingsService();

interface RatingPoint {
  x: string;
  y: number;
}

const ratingService = new RatingService();
const matchService = new MatchService();
const gameService = new GameService();
const userService = new UserService();

// повторное создание сервиса должно вернуть существующий singleton
const sameService = new RatingService();

// создаёт 4 пользователей, регистрирует их, создаёт и завершает матч
// (пара 1 проиграла обе игры: рейтинги 500 -> 490 у пары 1, 500 -> 510 у пары 2)
const seedFinishedMatch = async (
  ratings: number[] = [500, 500, 500, 500],
): Promise<{ ids: number[]; matchId: number }> => {
  const ids: number[] = [];
  for (let i = 0; i < ratings.length; i++) {
    const { id } = await userService.create(
      `Фамилия${i + 1}`,
      `Имя${i + 1}`,
      "Отчество",
      ratings[i],
      1,
      1,
      "1990-01-01",
    );
    ids.push(id);
  }
  await userService.registerAll();

  await matchService.create(...(ids as [number, number, number, number]));
  const match = (await matchService.getAll() as { id: number }[])[0];
  await gameService.create(match.id, "15", null, "2026-01-01 10:00:00");
  await gameService.create(match.id, "17", null, "2026-01-01 10:05:00");
  return { ids, matchId: match.id };
};

describe("Rating", () => {
  beforeEach(async () => {
    console.log = function () {};
    await clean();
    await settingsService.set("calibration_matches", "0");
  });

  describe("constructor", () => {
    it("должен вернуть существующий экземпляр при повторном создании", () => {
      assert.strictEqual(sameService, ratingService);
    });
  });

  describe("getByUserId", () => {
    it("должен вернуть пустой список для пользователя без матчей", async () => {
      const { id } = await userService.create("Фамилия", "Имя", "Отчество", 500, 1, 1, "1990-01-01");

      assert.deepStrictEqual(await ratingService.getByUserId(id), []);
    });

    it("должен вернуть пустой список для несуществующего пользователя", async () => {
      assert.deepStrictEqual(await ratingService.getByUserId(999), []);
    });

    it("должен вернуть точки рейтинга после завершения матча", async () => {
      const { ids } = await seedFinishedMatch();

      assert.deepStrictEqual<RatingPoint[]>(await ratingService.getByUserId(ids[0]), [
        { x: "2026-01-01 10:05:00", y: 490 },
      ]);
      assert.deepStrictEqual<RatingPoint[]>(await ratingService.getByUserId(ids[2]), [
        { x: "2026-01-01 10:05:00", y: 510 },
      ]);
    });

    it("должен вернуть точки по последней игре матча в хронологическом порядке", async () => {
      const { ids } = await seedFinishedMatch();

      // создаём второй матч, где пара с ids[0] выигрывает
      const extraIds: number[] = [];
      for (let i = 5; i <= 8; i++) {
        const { id } = await userService.create(`Соперник${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
        extraIds.push(id);
      }
      await userService.registerByIds(extraIds);
      await matchService.create(ids[0], ids[1], extraIds[0], extraIds[1]);
      const matches = await matchService.getAll() as { id: number; finished: number }[];
      const match2 = matches.find((m) => m.finished === 0)!;
      await gameService.create(match2.id, null, "15", "2026-01-02 10:00:00");
      await gameService.create(match2.id, null, "17", "2026-01-02 10:05:00");

      const points = await ratingService.getByUserId(ids[0]) as RatingPoint[];
      assert.strictEqual(points.length, 2);
      assert.deepStrictEqual(points.map((p) => p.x), ["2026-01-01 10:05:00", "2026-01-02 10:05:00"]);
      assert.ok(points.every((p) => typeof p.y === "number"));
      // x берётся из последней игры матча (max(id) в группе по match_id)
      assert.notDeepStrictEqual(points.map((p) => p.x), ["2026-01-01 10:00:00", "2026-01-02 10:00:00"]);
    });
  });
});
