import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import AchievementService from "../../src/services/achievement.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

interface Nomination {
  value: number;
  users: { user_id: number; name: string }[];
}

const achievementService = new AchievementService();
const matchService = new MatchService();
const gameService = new GameService();
const userService = new UserService();
const db = new Repository().db;

// время игры: base + offset минут (клиентские created_at идут от текущего момента)
const base = Date.now();
const at = (offsetMinutes: number) =>
  new Date(base + offsetMinutes * 60000).toISOString().replace("T", " ").substring(0, 19);

describe("Achievement", () => {
  beforeEach(async () => {
    console.log = function () {};
    await clean();
  });

  // шесть матчей текущего турнира «Новая Лига»:
  // M1: (u1,u2) против (u3,u4) — победа 2:0 (в т.ч. игра 27:25)
  // M2: (u1,u2) против (u3,u4) — победа (u3,u4) 2:0
  // M3: (u1,u2) против (u3,u4) — победа (u3,u4) 2:1, но по очкам выигрывает (u1,u2) — 61:47
  // M4: (u1,u2) против (u5,u6) — победа 2:0
  // M5: (u3,u4) против (u5,u6) — победа 2:0
  // M6: (u3,u4) против (u5,u6) — победа 2:0, первая игра 30:29
  // длительности игр: M1 40', M2 25', M3 70', M4 90', M5 30', M6 40'
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
    await seed([u3, u4, u5, u6], [[null, "29", 10], [null, "15", 40]]);     // M6: 30:29, 21:15
    // рейтинговые дельты пишет триггер calculate_rating_when_match_finished
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
    const four = [u1, u2, u3, u4];

    const result = achievementService.getByTournament(4) as Record<string, Nomination>;

    // Победитель: больше всех выигранных матчей — пара (u3,u4): M2, M3, M5, M6
    assert.deepStrictEqual(userIds(result.winner), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.winner.value, 4);
    // Пулемётчик: больше всех забитых воланов — пара (u3,u4): 30+42+47+42+51
    assert.deepStrictEqual(userIds(result.machine_gunner), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.machine_gunner.value, 212);
    // Очень старался, но ничего не получилось: проигранный матч с перевесом по очкам — M3
    assert.deepStrictEqual(userIds(result.trier), pair12.sort((a, b) => a - b));
    assert.strictEqual(result.trier.value, 1);
    // Стальные нервы: выигранные игры со счётом >= 22 — (u3,u4): 22, 22, 30
    assert.deepStrictEqual(userIds(result.iron_nerves), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.iron_nerves.value, 3);
    // Черепаха: больше всех минут в играх — 40+25+70+90
    assert.deepStrictEqual(userIds(result.turtle), pair12.sort((a, b) => a - b));
    assert.strictEqual(result.turtle.value, 225);
    // Неудержимый: самая длинная серия выигранных игр подряд — (u3,u4):
    // с M3 g2 по M6 g2 — 6 игр (после единственного поражения в M3 g1)
    assert.deepStrictEqual(userIds(result.unrestrainable), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.unrestrainable.value, 6);
    // Быстрый старт: выигранная первая игра матча — по 3 у обеих пар
    assert.deepStrictEqual(userIds(result.fast_start), four.sort((a, b) => a - b));
    assert.strictEqual(result.fast_start.value, 3);
    // Дожиматель: решающая игра при 1:1 — M3, третья игра
    assert.deepStrictEqual(userIds(result.finisher), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.finisher.value, 1);
    // Камбэк: победа после проигранной первой игры — M3
    assert.deepStrictEqual(userIds(result.comeback), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.comeback.value, 1);
    // Идеальный сезон: (u3,u4) проиграли M1, (u1,u2) — M2/M3, у (u5,u6) нет побед — не показывается
    assert.strictEqual(result.perfect, undefined);
    // На измор: победа, когда соперник набрал 29 — M6, первая игра
    assert.deepStrictEqual(userIds(result.endurance), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.endurance.value, 1);
    // Почти смог: проигранная игра со своим счётом >= 20 — (u1,u2): две игры 20:22
    assert.deepStrictEqual(userIds(result.almost), pair12.sort((a, b) => a - b));
    assert.strictEqual(result.almost.value, 2);
    // Разгром: игры, выигранные с разницей >= 15 — (u1,u2): 16, 18, 18
    assert.deepStrictEqual(userIds(result.rout), pair12.sort((a, b) => a - b));
    assert.strictEqual(result.rout.value, 3);
    // Гроза пар: победы над разными парами — обе пары победили пары (u1,u2) и (u5,u6)…
    // (u1,u2): над (u3,u4) и (u5,u6); (u3,u4): над (u1,u2) и (u5,u6)
    assert.deepStrictEqual(userIds(result.nightmare), four.sort((a, b) => a - b));
    assert.strictEqual(result.nightmare.value, 2);
    // Трудяга: больше всех сыгранных игр — (u3,u4): 2+2+3+2+2
    assert.deepStrictEqual(userIds(result.workhorse), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.workhorse.value, 11);
    // Молния: самые короткие игры в среднем при >= 3 играх — (u3,u4): 205' / 11 игр
    assert.deepStrictEqual(userIds(result.lightning), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.lightning.value, 18.6);
    // Восходящая звезда: больше всех рейтинговых очков — (u3,u4):
    // поражение в M1 и четыре победы, дельта триггера ±8.5 при равных рейтингах
    assert.deepStrictEqual(userIds(result.rising_star), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.rising_star.value, 25.5);
    // Стабильный: лучший средний прирост рейтинга за матч при >= 3 матчах — (u3,u4): 25.5 / 5
    assert.deepStrictEqual(userIds(result.consistent), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.consistent.value, 5.1);
    // Жертва дедлайна: все матчи созданы в последний час сессии — (u3,u4) сыграла 5
    assert.deepStrictEqual(userIds(result.deadline), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.deadline.value, 5);
    // Связка: пара (u3,u4) — 4 совместные победы (M2, M3, M5, M6)
    assert.deepStrictEqual(userIds(result.duo), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.duo.value, 4);
    // Универсал: у всех по одному партнёру — не показывается
    assert.strictEqual(result.universal, undefined);
    // Медалист: больше всех номинаций — (u3,u4) лидирует в 15
    assert.deepStrictEqual(userIds(result.medalist), pair34.sort((a, b) => a - b));
    assert.strictEqual(result.medalist.value, 15);
  });

  it("должен разделить номинацию между игроками с одинаковым результатом", async () => {
    const [u1, u2] = await seedMatches();
    const result = achievementService.getByTournament(4) as Record<string, Nomination>;

    // партнёры по команде всегда имеют одинаковые показатели
    assert.deepStrictEqual(userIds(result.turtle), [u1, u2].sort((a, b) => a - b));
  });

  it("должен определить связку, универсала и грозу пар на смешанных парах", async () => {
    const [u1, u2, u3, u4, u5] = await seedMixedPairs();
    const result = achievementService.getByTournament(4) as Record<string, Nomination>;

    // Связка: пара (u1,u2) — 2 совместные победы
    assert.deepStrictEqual(userIds(result.duo), [u1, u2].sort((a, b) => a - b));
    assert.strictEqual(result.duo.value, 2);
    // Универсал: 2 разных партнёра — u1 (u2, u3), u2 (u1, u5), u3 (u4, u1), u5 (u6, u2)
    assert.deepStrictEqual(userIds(result.universal), [u1, u2, u3, u5].sort((a, b) => a - b));
    assert.strictEqual(result.universal.value, 2);
    // Гроза пар: u1 победил три разные пары
    assert.deepStrictEqual(userIds(result.nightmare), [u1]);
    assert.strictEqual(result.nightmare.value, 3);
  });

  it("должен найти матчи последнего часа сессии", async () => {
    const [u1, u2, u3, u4, u5, u6] = await seedDeadline();
    const result = achievementService.getByTournament(4) as Record<string, Nomination>;

    // вчера: 10:00, 11:00, 11:50 — дедлайн после 10:50 (m2, m3);
    // сегодня: один матч — всегда в дедлайне (m4)
    // u1,u2 сыграли m2, m3, m4 — 3 матча
    assert.deepStrictEqual(userIds(result.deadline), [u1, u2].sort((a, b) => a - b));
    assert.strictEqual(result.deadline.value, 3);
    assert.strictEqual(result.deadline.users.length, 2);
    void u3; void u4; void u5; void u6;
  });

  it("должен вернуть номинации пользователя для модалки игрока", async () => {
    const [u1, u2, u3, u4, u5] = await seedMatches();

    // u1,u2 — 6 номинаций
    assert.deepStrictEqual(achievementService.getNominationsByUser(u1, 4), [
      "Очень старался, но ничего не получилось", "Быстрый старт",
      "Почти смог", "Разгром", "Гроза пар", "Черепаха"
    ]);
    // партнёр по команде имеет те же номинации
    assert.deepStrictEqual(achievementService.getNominationsByUser(u2, 4),
        achievementService.getNominationsByUser(u1, 4));
    // u3,u4 — Медалист (первым) и ещё 15 номинаций
    assert.deepStrictEqual(achievementService.getNominationsByUser(u3, 4), [
      "Медалист", "Победитель", "Пулемётчик", "Неудержимый", "Быстрый старт", "Дожиматель",
      "Камбэк", "На измор", "Стальные нервы", "Связка", "Гроза пар", "Трудяга",
      "Молния", "Восходящая звезда", "Стабильный", "Жертва дедлайна"
    ]);
    // без номинаций
    assert.deepStrictEqual(achievementService.getNominationsByUser(u5, 4), []);
  });

  // три матча со смешанными парами:
  // A: (u1,u2) против (u3,u4) — победа 2:0
  // B: (u1,u2) против (u5,u6) — победа 2:0
  // C: (u1,u3) против (u2,u5) — победа 2:0
  const seedMixedPairs = async (): Promise<number[]> => {
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

    await seed([u1, u2, u3, u4], [[null, "5", 10], [null, "5", 30]]);
    await seed([u1, u2, u5, u6], [[null, "5", 10], [null, "5", 30]]);
    await seed([u1, u3, u2, u5], [[null, "5", 10], [null, "5", 30]]);
    return ids;
  };

  // четыре матча: вчерашняя сессия (m1–m3, конец 11:50) и сегодняшняя (m4)
  const seedDeadline = async (): Promise<number[]> => {
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
      return matchId;
    };

    const yesterday = (hours: number) =>
      new Date(base - 86400000 + hours * 3600000).toISOString().replace("T", " ").substring(0, 19);

    const m1 = await seed([u1, u2, u3, u4], [[null, "5", 10], [null, "5", 30]]);
    const m2 = await seed([u1, u2, u3, u4], [[null, "5", 10], [null, "5", 30]]);
    const m3 = await seed([u1, u2, u5, u6], [[null, "5", 10], [null, "5", 30]]);
    await seed([u1, u2, u5, u6], [[null, "5", 10], [null, "5", 30]]); // m4 — сегодня

    db.run("UPDATE match SET created_at = ? WHERE id = ?", [yesterday(10), m1]);
    db.run("UPDATE match SET created_at = ? WHERE id = ?", [yesterday(11), m2]);
    db.run("UPDATE match SET created_at = ? WHERE id = ?", [yesterday(11 + 50 / 60), m3]);
    return ids;
  };
});
