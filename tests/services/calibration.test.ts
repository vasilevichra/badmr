import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { testDbPath } from "../../src/test-db.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import UserService from "../../src/services/user.ts";
import SettingsService from "../../src/services/settings.ts";
import { clean } from "../helpers/migration.ts";

const matchService = new MatchService();
const gameService = new GameService();
const userService = new UserService();
const settingsService = new SettingsService();

const db = new DatabaseSync(testDbPath(), { enableForeignKeyConstraints: false });

interface RatingRow {
  previous: number;
  delta: number;
}

/** Последняя строка рейтинга пользователя (previous + delta = текущий рейтинг). */
const lastRating = (userId: number): RatingRow | undefined => {
  const row = db.prepare(
      `SELECT previous, delta
       FROM rating
       WHERE user_id = ?
         AND match_id IS NOT NULL
       ORDER BY id DESC
       LIMIT 1`,
  ).get(userId) as unknown as RatingRow | undefined;
  return row === undefined ? undefined : {...row};
};

const createUser = (n: number, rating = 500) =>
  userService.create(`Фамилия${n}`, `Имя${n}`, "Отчество", rating, 1, 1, "1990-01-01");

/** Создаёт 4 пользователей, регистрирует их, создаёт и завершает матч.
 *  games: [lost_1_by, lost_2_by] — null у победителя. */
const seedMatch = async (
  ratings: [number, number, number, number],
  games: [string | null, string | null][],
): Promise<{ ids: number[]; matchId: number }> => {
  const ids: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { id } = await createUser(i + 1, ratings[i]);
    ids.push(id);
  }
  await userService.registerAll();

  await matchService.create(...(ids as [number, number, number, number]));
  const match = (await matchService.getAll() as { id: number }[]).at(-1)!;
  for (const [l1, l2] of games) {
    await gameService.create(match.id, l1, l2, "2026-01-01 10:00:00");
  }
  return { ids, matchId: match.id };
};

describe("Calibration", () => {
  beforeEach(async () => {
    await clean();
    // сброс настроек калибровки к дефолтам (перекрываются tournament_settings в тестах)
    db.prepare("DELETE FROM tournament_settings WHERE defaults_id IN (SELECT id FROM defaults WHERE name LIKE 'calibration%')").run();
  });

  it("сид без матчей запускает калибровку: первый матч с усиленным K", async () => {
    await settingsService.set("calibration_matches", "2");
    await settingsService.set("calibration_boost", "3");
    await settingsService.set("calibration_cap", "0");

    // равные рейтинги → база (100 - 0) / 10 = 10, множитель series=1 → 3
    const { ids } = await seedMatch([500, 500, 500, 500], [[null, "15"], [null, "17"]]);

    assert.deepStrictEqual(lastRating(ids[0]), { previous: 500, delta: 30 });
    assert.deepStrictEqual(lastRating(ids[2]), { previous: 500, delta: -30 });
  });

  it("множитель затухает до 1 к концу серии калибровки", async () => {
    await settingsService.set("calibration_matches", "2");
    await settingsService.set("calibration_boost", "3");
    await settingsService.set("calibration_cap", "0");

    const { ids } = await seedMatch([500, 500, 500, 500], [[null, "15"], [null, "17"]]);
    // series=1: база 10 × 3 = 30 → 530/470
    assert.deepStrictEqual(lastRating(ids[0]), { previous: 500, delta: 30 });

    // series=2: разница средних 0 → база 10, множитель 1 + 2·(2−2+1)/2 = 2 → +20
    await matchService.create(ids[0], ids[1], ids[2], ids[3]);
    const matches = await matchService.getAll() as { id: number; finished: number }[];
    const match2 = matches.find((m) => m.finished === 0)!;
    await gameService.create(match2.id, null, "15", "2026-01-01 11:00:00");
    await gameService.create(match2.id, null, "17", "2026-01-01 11:05:00");
    // series=2: оба партнёра 530 против 470 → база (100−60)/10 = 4, множитель 2 → +8
    assert.deepStrictEqual(lastRating(ids[0]), { previous: 530, delta: 8 });

    // series=3 > C: без калибровки, база (100−76)/10 = 2.4
    await matchService.create(ids[0], ids[1], ids[2], ids[3]);
    const matches3 = await matchService.getAll() as { id: number; finished: number }[];
    const match3 = matches3.find((m) => m.finished === 0)!;
    await gameService.create(match3.id, null, "15", "2026-01-01 12:00:00");
    await gameService.create(match3.id, null, "17", "2026-01-01 12:05:00");
    assert.deepStrictEqual(lastRating(ids[0]), { previous: 538, delta: 2.4 });
  });

  it("кап ограничивает дельту внутри калибровки", async () => {
    // дефолты: C=3, boost=3, cap=20 → база 10 × 3 = 30 обрезается до 20
    const { ids } = await seedMatch([500, 500, 500, 500], [[null, "15"], [null, "17"]]);

    assert.deepStrictEqual(lastRating(ids[0]), { previous: 500, delta: 20 });
    assert.deepStrictEqual(lastRating(ids[2]), { previous: 500, delta: -20 });
  });

  it("кап не действует вне калибровки", async () => {
    await settingsService.set("calibration_matches", "0");

    const { ids } = await seedMatch([500, 500, 500, 500], [[null, "15"], [null, "17"]]);

    assert.deepStrictEqual(lastRating(ids[0]), { previous: 500, delta: 10 });
  });

  it("исторический рейтинг (stale=0) не калибруется", async () => {
    // ветеран с историей до внедрения калибровки: строка рейтинга со stale=0
    const { ids } = await seedMatch([500, 500, 500, 500], [[null, "15"], [null, "17"]]);
    db.prepare("UPDATE rating SET stale = 0, series = 0 WHERE match_id = ?").run(
        (await matchService.getAll() as { id: number }[])[0].id,
    );

    // свежий матч: R.stale=0, дата свежая → без boost, база (100−40)/10 = 6
    await matchService.create(ids[0], ids[1], ids[2], ids[3]);
    const matches = await matchService.getAll() as { id: number; finished: number }[];
    const match2 = matches.find((m) => m.finished === 0)!;
    await gameService.create(match2.id, null, "15", "2026-01-02 10:00:00");
    await gameService.create(match2.id, null, "17", "2026-01-02 10:05:00");

    assert.deepStrictEqual(lastRating(ids[0]), { previous: 520, delta: 6 });
  });

  it("перерыв больше fresh_days перезапускает серию калибровки", async () => {
    await settingsService.set("calibration_matches", "2");
    await settingsService.set("calibration_boost", "3");
    await settingsService.set("calibration_cap", "0");

    const { ids, matchId } = await seedMatch([500, 500, 500, 500], [[null, "15"], [null, "17"]]);
    assert.deepStrictEqual(lastRating(ids[0]), { previous: 500, delta: 30 });

    // откатываем матч на 70 дней назад — дата рейтинга берётся из связки с матчем
    db.prepare("UPDATE match SET created_at = '2025-10-01 10:00:00' WHERE id = ?").run(matchId);

    // серия перезапускается: series=1, база (100−60)/10 = 4 × 3 = 12
    await matchService.create(ids[0], ids[1], ids[2], ids[3]);
    const matches = await matchService.getAll() as { id: number; finished: number }[];
    const match2 = matches.find((m) => m.finished === 0)!;
    await gameService.create(match2.id, null, "15", "2026-01-01 11:00:00");
    await gameService.create(match2.id, null, "17", "2026-01-01 11:05:00");

    assert.deepStrictEqual(lastRating(ids[0]), { previous: 530, delta: 12 });
  });

  it("разница средних 100 и больше обнуляет дельту даже в калибровке", async () => {
    // пара 3/4 сильнее на 200: её победа не должна ничего давать
    const { ids } = await seedMatch([400, 400, 600, 600], [["15", null], ["17", null]]);

    assert.deepStrictEqual(lastRating(ids[0]), { previous: 400, delta: 0 });
    assert.deepStrictEqual(lastRating(ids[2]), { previous: 600, delta: 0 });
  });
});
