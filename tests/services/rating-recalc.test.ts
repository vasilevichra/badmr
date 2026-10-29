import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { testDbPath } from "../../src/test-db.ts";
import RatingService from "../../src/services/rating.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import UserService from "../../src/services/user.ts";
import SettingsService from "../../src/services/settings.ts";
import { clean } from "../helpers/migration.ts";

const ratingService = new RatingService();
const matchService = new MatchService();
const gameService = new GameService();
const userService = new UserService();
const settingsService = new SettingsService();

const db = new DatabaseSync(testDbPath(), { enableForeignKeyConstraints: false });

interface RatingRow {
  match_id: number;
  user_id: number;
  previous: number;
  delta: number;
  stale: number;
  series: number;
}

/** Все строки рейтинга матча, отсортированные по user_id. */
const ratingRows = (matchId: number): RatingRow[] =>
    (db.prepare(
        `SELECT match_id, user_id, previous, delta, stale, series
         FROM rating
         WHERE match_id = ?
         ORDER BY user_id`,
    ).all(matchId) as unknown as RatingRow[]).map((r) => ({...r}));

/** Последняя строка рейтинга игрока. */
const userRating = (userId: number): RatingRow | undefined => {
  const row = db.prepare(
      `SELECT match_id, user_id, previous, delta, stale, series
       FROM rating
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 1`,
  ).get(userId) as unknown as RatingRow | undefined;
  return row === undefined ? undefined : {...row};
};

const matchFinished = (matchId: number): number =>
    (db.prepare(`SELECT finished FROM match WHERE id = ?`).get(matchId) as unknown as { finished: number }).finished;

const createUser = (n: number, rating = 500) =>
    userService.create(`Фамилия${n}`, `Имя${n}`, "Отчество", rating, 1, 1, "1990-01-01");

/** Создаёт и завершает матч: две игры, проигрывает указанная пара. */
const seedMatch = async (ids: [number, number, number, number], loser: 1 | 2, date: string): Promise<number> => {
  await matchService.create(...ids);
  const match = (await matchService.getAll() as { id: number }[]).at(-1)!;
  const l1 = loser === 1 ? "15" : null;
  const l2 = loser === 2 ? "15" : null;
  await gameService.create(match.id, l1, l2, date);
  await gameService.create(match.id, l1, l2, date);
  return match.id;
};

/** Первый id игры матча. */
const firstGameId = (matchId: number): number =>
    (db.prepare(`SELECT id FROM game WHERE match_id = ? ORDER BY id LIMIT 1`).get(matchId) as unknown as { id: number }).id;

const allGames = (matchId: number): { id: number }[] =>
    db.prepare(`SELECT id FROM game WHERE match_id = ? ORDER BY id`).all(matchId) as unknown as { id: number }[];

/** Пользователи 1–4 + регистрация; возвращает их id. */
const seedCoreUsers = async (ratings: number[] = [500, 500, 500, 500]): Promise<number[]> => {
  const ids: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { id } = await createUser(i + 1, ratings[i]);
    ids.push(id);
  }
  await userService.registerAll();
  return ids;
};

/** Пользователи 5–6 + регистрация. */
const seedExtraUsers = async (ratings: number[] = [500, 500]): Promise<number[]> => {
  const ids: number[] = [];
  for (let i = 0; i < ratings.length; i++) {
    const { id } = await createUser(i + 5, ratings[i]);
    ids.push(id);
  }
  await userService.registerByIds(ids);
  return ids;
};

/** Меняет исход всех игр матча: выигрывает пара 2 (lost_2_by). */
const flipGamesToPair2Win = async (matchId: number) => {
  for (const g of allGames(matchId)) {
    await gameService.update(g.id, null, "15");
  }
};

describe("Rating recalc", () => {
  beforeEach(async () => {
    console.log = function () {};
    await clean();
    // параметры формулы — дефолты миграций (тесты могут переопределять)
    await settingsService.set("rating_diff_limit", "100");
    await settingsService.set("rating_diff_divisor", "10");
    // калибровка по умолчанию выключена, включается в своих тестах
    await settingsService.set("calibration_matches", "0");
  });

  describe("recalc", () => {
    it("пересчитывает изменённый матч (расфинишивает) и каскадно последующие", async () => {
      const ids = await seedCoreUsers();
      const extra = await seedExtraUsers();
      const matchA = await seedMatch([ids[0], ids[1], ids[2], ids[3]], 1, "2026-01-01 10:00:00");
      const matchB = await seedMatch([ids[0], ids[1], extra[0], extra[1]], 1, "2026-01-02 10:00:00");

      // после A: 490 у пары 1, 510 у пары 2; после B: delta -9 → 481
      assert.equal(userRating(ids[0])!.match_id, matchB);
      assert.equal(userRating(ids[0])!.previous, 490);
      assert.equal(userRating(ids[0])!.delta, -9);

      // меняем исход первой игры A: по игре выиграли обе пары —
      // матч перестаёт быть завершённым (wins = 2)
      await gameService.update(firstGameId(matchA), null, "15");
      ratingService.recalc(ratingService.getRecalcSource(matchA)!);

      // строки рейтинга A удалены, матч расфинишен
      assert.deepEqual(ratingRows(matchA), []);
      assert.equal(matchFinished(matchA), 0);

      // B пересчитан от сидов: previous 500, delta -10 / +10
      assert.equal(userRating(ids[0])!.previous, 500);
      assert.equal(userRating(ids[0])!.delta, -10);
      assert.equal(userRating(extra[0])!.previous, 500);
      assert.equal(userRating(extra[0])!.delta, 10);
    });

    it("пересчитывает каскад после удаления игры", async () => {
      const ids = await seedCoreUsers();
      const extra = await seedExtraUsers();
      const matchA = await seedMatch([ids[0], ids[1], ids[2], ids[3]], 1, "2026-01-01 10:00:00");
      await seedMatch([ids[0], ids[1], extra[0], extra[1]], 1, "2026-01-02 10:00:00");

      await gameService.deleteById(firstGameId(matchA));
      ratingService.recalc(ratingService.getRecalcSource(matchA)!);

      assert.deepEqual(ratingRows(matchA), []);
      assert.equal(matchFinished(matchA), 0);
      assert.equal(userRating(ids[0])!.previous, 500);
      assert.equal(userRating(ids[0])!.delta, -10);
    });

    it("пересчитывает каскад после удаления матча", async () => {
      const ids = await seedCoreUsers();
      const extra = await seedExtraUsers();
      const matchA = await seedMatch([ids[0], ids[1], ids[2], ids[3]], 1, "2026-01-01 10:00:00");
      const matchB = await seedMatch([ids[0], ids[1], extra[0], extra[1]], 1, "2026-01-02 10:00:00");

      // снапшот удаляемого матча A — до удаления, пересчёт последующих — после
      const source = ratingService.getRecalcSource(matchA)!;
      source.includeSelf = false;
      await matchService.deleteById(matchA);
      ratingService.recalc(source);

      assert.equal(userRating(ids[0])!.match_id, matchB);
      assert.equal(userRating(ids[0])!.previous, 500);
      assert.equal(userRating(ids[0])!.delta, -10);
      assert.equal(userRating(extra[0])!.previous, 500);
      assert.equal(userRating(extra[0])!.delta, 10);
    });

    it("берёт параметры формулы из settings (divisor)", async () => {
      await settingsService.set("rating_diff_divisor", "20");
      const ids = await seedCoreUsers();
      const extra = await seedExtraUsers();
      const matchA = await seedMatch([ids[0], ids[1], ids[2], ids[3]], 1, "2026-01-01 10:00:00");
      await seedMatch([ids[0], ids[1], extra[0], extra[1]], 1, "2026-01-02 10:00:00");

      // триггер: дельта A = (100 - 0) / 20 = 5
      assert.deepEqual(ratingRows(matchA).map((r) => r.delta), [-5, -5, 5, 5]);

      // меняем исход обеих игр A: теперь выигрывает пара 1
      await flipGamesToPair2Win(matchA);
      ratingService.recalc(ratingService.getRecalcSource(matchA)!);

      // A: пара 1 выиграла — +5 (k=20); B: prev пары1 505, extra 500;
      // пара 1 проигрывает B: lose12 = (100 - (500 - 505)) / -20 = -5.25 → -5.3
      assert.equal(userRating(ids[0])!.previous, 505);
      assert.equal(userRating(ids[0])!.delta, -5.3);
      assert.equal(userRating(extra[0])!.previous, 500);
      assert.equal(userRating(extra[0])!.delta, 5.3);
    });

    it("no-op пересчёт не переписывает строки, посчитанные триггером", async () => {
      const ids = await seedCoreUsers();
      const extra = await seedExtraUsers();
      const matchA = await seedMatch([ids[0], ids[1], ids[2], ids[3]], 1, "2026-01-01 10:00:00");
      await seedMatch([ids[0], ids[1], extra[0], extra[1]], 1, "2026-01-02 10:00:00");

      const before = db.prepare(
          `SELECT id, match_id, user_id, previous, delta, stale, series FROM rating ORDER BY id`,
      ).all();

      ratingService.recalc(ratingService.getRecalcSource(matchA)!);

      const after = db.prepare(
          `SELECT id, match_id, user_id, previous, delta, stale, series FROM rating ORDER BY id`,
      ).all();

      // формулы TS-пересчёта и триггера совпали — строки не тронуты (id те же)
      assert.deepEqual(after, before);
    });

    it("формула дельты симметрична: нулевая сумма и зеркальность при смене победителя", async () => {
      // калибровка и cap выключены — проверяется сырая формула
      await settingsService.set("calibration_matches", "0");
      await settingsService.set("calibration_cap", "0");

      // сильная пара 1/2 (520) против слабой 2 (500), разница средних 20
      const ids = await seedCoreUsers([520, 520, 500, 500]);
      const matchWins = await seedMatch([ids[0], ids[1], ids[2], ids[3]], 2, "2026-01-01 10:00:00");

      // фаворит выигрывает: ±(100 - 20) / 10 = ±8
      assert.deepEqual(ratingRows(matchWins).map((r) => r.delta), [8, 8, -8, -8]);
      assert.equal(ratingRows(matchWins).reduce((s, r) => s + r.delta, 0), 0);

      // тот же матч, но выигрывает аутсайдер: ±(100 + 20) / 10 = ±12
      await clean();
      // clean() сбрасывает переопределения настроек — задаём заново
      await settingsService.set("calibration_matches", "0");
      await settingsService.set("calibration_cap", "0");
      const ids2 = await seedCoreUsers([520, 520, 500, 500]);
      const matchUpset = await seedMatch([ids2[0], ids2[1], ids2[2], ids2[3]], 1, "2026-01-01 10:00:00");
      assert.deepEqual(ratingRows(matchUpset).map((r) => r.delta), [-12, -12, 12, 12]);
      assert.equal(ratingRows(matchUpset).reduce((s, r) => s + r.delta, 0), 0);

      // смена победителя меняет только знаки (|дельты| те же)
      assert.deepEqual(
          ratingRows(matchUpset).map((r) => Math.abs(r.delta)),
          ratingRows(matchWins).map((r) => Math.abs(r.delta)),
      );
    });

    it("применяет калибровку при пересчёте", async () => {
      await settingsService.set("calibration_matches", "3");
      await settingsService.set("calibration_boost", "3");
      await settingsService.set("calibration_cap", "20");
      await settingsService.set("calibration_days", "60");

      const ids = await seedCoreUsers();
      const extra = await seedExtraUsers();
      const matchA = await seedMatch([ids[0], ids[1], ids[2], ids[3]], 1, "2026-01-01 10:00:00");
      await seedMatch([ids[0], ids[1], extra[0], extra[1]], 1, "2026-01-02 10:00:00");

      // меняем исход обеих игр A: выигрывает пара 1
      await flipGamesToPair2Win(matchA);
      ratingService.recalc(ratingService.getRecalcSource(matchA)!);

      // A: сид → серия 1, множитель 3, кап 20: +10 * 3 = 30 → cap 20
      assert.deepEqual(
          ratingRows(matchA).map((r) => [r.previous, r.delta, r.stale, r.series]),
          [[500, 20, 1, 1], [500, 20, 1, 1], [500, -20, 1, 1], [500, -20, 1, 1]],
      );

      // B: пара 1 проигрывает: lose12 = (100 - (500 - 520)) / -10 = -12;
      // серия 2 → множитель 1 + 2 * (3 - 2 + 1) / 3 ≈ 2.333 → -12 * 2.333 = -28 → cap -20;
      // у extra сид → множитель 3, win34 = (100 + 20) / 10 = 12 → 36 → cap 20
      assert.equal(userRating(ids[0])!.previous, 520);
      assert.equal(userRating(ids[0])!.delta, -20);
      assert.equal(userRating(extra[0])!.previous, 500);
      assert.equal(userRating(extra[0])!.delta, 20);
    });
  });
});
