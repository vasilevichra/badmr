import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import AchievementService from "../../src/services/achievement.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";

interface Nomination {
  value: number;
  users: { user_id: number; name: string }[];
}

const achievementService = new AchievementService();
const matchService = new MatchService();
const gameService = new GameService();
const userService = new UserService();

// время игры: base + offset минут (клиентские created_at идут от текущего момента)
const base = Date.now();
const at = (offsetMinutes: number) =>
  new Date(base + offsetMinutes * 60000).toISOString().replace("T", " ").substring(0, 19);

describe("Achievement", () => {
  beforeEach(async () => {
    console.log = function () {};
    await clean();
  });

  // пять матчей текущего турнира «Новая Лига»:
  // M1: (u1,u2) против (u3,u4) — победа 2:0 (в т.ч. игра 27:25)
  // M2: (u1,u2) против (u3,u4) — победа (u3,u4) 2:0
  // M3: (u1,u2) против (u3,u4) — победа (u3,u4) 2:1, но по очкам выигрывает (u1,u2) — 61:47
  // M4: (u1,u2) против (u5,u6) — победа 2:0
  // M5: (u3,u4) против (u5,u6) — победа 2:0
  // длительности игр: M1 40', M2 25', M3 70', M4 90', M5 30'
  const seedMatches = async (): Promise<number[]> => {
    const ids: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const { id } = await userService.create(`Игрок${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
      ids.push(id);
    }
    const [u1, u2, u3, u4, u5, u6] = ids;

    const seed = async (users: number[], games: [string | null, string | null, number][]) => {
      await matchService.create(...(users as [number, number, number, number]));
      const matchId = (await matchService.getAll() as { id: number }[]).slice(-1)[0].id;
      for (const [l1, l2, offset] of games) {
        await gameService.create(matchId, l1, l2, at(offset));
      }
    };

    await seed([u1, u2, u3, u4], [[null, "5", 10], [null, "25", 40]]);      // M1: 21:5, 27:25
    await seed([u1, u2, u3, u4], [["5", null, 10], ["8", null, 25]]);       // M2: 5:21, 8:21
    await seed([u1, u2, u3, u4], [[null, "3", 10], ["20", null, 30], ["20", null, 70]]); // M3: 21:3, 22:20, 22:20
    await seed([u1, u2, u5, u6], [[null, "8", 30], [null, "3", 90]]);       // M4: 21:8, 21:3
    await seed([u3, u4, u5, u6], [[null, "5", 10], [null, "15", 30]]);      // M5: 21:5, 21:15
    return ids;
  };

  const userIds = (nomination: Nomination | undefined) =>
    nomination ? nomination.users.map((u) => u.user_id).sort((a, b) => a - b) : [];

  it("должен вернуть пустой список достижений, когда в турнире нет завершённых матчей", async () => {
    await userService.create("Игрок", "Имя", "Отчество", 500, 1, 1, "1990-01-01");

    assert.deepStrictEqual(achievementService.getByTournament(4), {});
  });

  it("должен определить лидеров номинаций по завершённым матчам турнира", async () => {
    const [u1, u2, u3, u4] = await seedMatches();
    const pair12 = [u1, u2];
    const pair34 = [u3, u4];

    const result = achievementService.getByTournament(4) as Record<string, Nomination>;

    // Победитель: больше всех выигранных матчей — пара (u3,u4)
    assert.deepStrictEqual(userIds(result.winner), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.winner.value, 3);
    // Пулемётчик: больше всех забитых воланов — пара (u1,u2), 48+13+61+42
    assert.deepStrictEqual(userIds(result.machine_gunner), pair12.sort((a, b) => a - b));
    assert.strictEqual(result.machine_gunner.value, 164);
    // Очень старался, но ничего не получилось: проигранный матч с перевесом по очкам — M3
    assert.deepStrictEqual(userIds(result.trier), pair12.sort((a, b) => a - b));
    assert.strictEqual(result.trier.value, 1);
    // Стальные нервы: выигранные игры со счётом >= 22 — две игры 22:20 в M3
    assert.deepStrictEqual(userIds(result.iron_nerves), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.iron_nerves.value, 2);
    // Черепаха: больше всех минут в играх — 40+25+70+90
    assert.deepStrictEqual(userIds(result.turtle), pair12.sort((a, b) => a - b));
    assert.strictEqual(result.turtle.value, 225);
    // Медалист: больше всех номинаций — Пулемётчик, Очень старался, Черепаха
    assert.deepStrictEqual(userIds(result.medalist), pair12.sort((a, b) => a - b));
    assert.strictEqual(result.medalist.value, 3);
  });

  it("должен разделить номинацию между игроками с одинаковым результатом", async () => {
    const [u1, u2] = await seedMatches();
    const result = achievementService.getByTournament(4) as Record<string, Nomination>;

    // партнёры по команде всегда имеют одинаковые показатели
    assert.deepStrictEqual(userIds(result.turtle), [u1, u2].sort((a, b) => a - b));
  });
});
