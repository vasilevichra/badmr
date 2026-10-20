import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import MatchService from "../../src/services/match.ts";
import UserService from "../../src/services/user.ts";
import CourtService from "../../src/services/court.ts";
import GameService from "../../src/services/game.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

interface TestUser {
  lastname: string;
  firstname: string;
}

const matchService = new MatchService();
const gameService = new GameService();
const db = new Repository().db;

// в тестовой БД текущий турнир id=4 ('Новая Лига') с кортами id 11-13 (номера 1-3);
// пользователи создаются через UserService, т.к. сиды пользователей не пересекаются с создаваемыми
interface MatchRow {
  user_1_id: number;
  user_2_id: number;
  user_3_id: number;
  user_4_id: number;
  court_id: number;
  finished: number;
  id: number;
}

const users: TestUser[] = [
  { lastname: "Тестов", firstname: "Алексей" },
  { lastname: "Смирнов", firstname: "Борис" },
  { lastname: "Кузнецова", firstname: "Вера" },
  { lastname: "Попов", firstname: "Григорий" },
];

// создаёт 4 пользователей и регистрирует их на текущий турнир
const seedMatchUsers = async (): Promise<number[]> => {
  const userService = new UserService();
  const ids: number[] = [];
  for (const u of users) {
    const { id } = await userService.create(u.lastname, u.firstname, "Отчество", 500, 1, 1, "1990-01-01");
    ids.push(id);
  }
  await userService.registerByIds(ids);
  return ids;
};

describe("Match", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("getAll, hasUnfinished, getAllUnfinished", () => {
    it("должен вернуть пустые списки когда матчей нет", async () => {
      assert.deepStrictEqual(await matchService.getAll(), []);
      assert.deepStrictEqual(await matchService.hasUnfinished(), {
        has: 0,
      });
      assert.deepStrictEqual(await matchService.getAllUnfinished(), []);
    });
  });

  describe("create", () => {
    it("должен создать матч на первом доступном корте", async () => {
      const ids = await seedMatchUsers();

      await matchService.create(...(ids as [number, number, number, number]));

      const matches = await matchService.getAll() as MatchRow[];
      assert.strictEqual(matches.length, 1);
      assert.deepStrictEqual(
        [
          matches[0].user_1_id,
          matches[0].user_2_id,
          matches[0].user_3_id,
          matches[0].user_4_id,
        ],
        ids,
      );
      assert.strictEqual(matches[0].court_id, 11);
      assert.strictEqual(matches[0].finished, 0);
    });

    it("должен сделать корт недоступным и отвязать участников", async () => {
      const ids = await seedMatchUsers();

      await matchService.create(...(ids as [number, number, number, number]));

      const courts = await new CourtService().getAll();
      assert.deepStrictEqual(courts, [
        { id: 11, number: 1, available: 0 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
      ]);

      const unfinished = await matchService.getAllUnfinished() as {
        id: number; user_1_id: number; court: number; name1: string;
      }[];
      assert.strictEqual(unfinished.length, 1);
      assert.strictEqual(unfinished[0].user_1_id, ids[0]);
      assert.strictEqual(unfinished[0].court, 1);
      assert.strictEqual(unfinished[0].name1, "Тестов Алексей");
      assert.deepStrictEqual(await matchService.hasUnfinished(), {
        has: 1,
      });
    });
  });

  describe("getById", () => {
    it("должен вернуть матч по id", async () => {
      const ids = await seedMatchUsers();

      await matchService.create(...(ids as [number, number, number, number]));
      const created = (await matchService.getAll() as MatchRow[])[0];

      assert.deepStrictEqual(await matchService.getById(created.id), created);
    });
  });

  describe("deleteById", () => {
    it("должен удалить матч и вернуть корт с участниками", async () => {
      const ids = await seedMatchUsers();

      await matchService.create(...(ids as [number, number, number, number]));
      const created = (await matchService.getAll() as MatchRow[])[0];

      await matchService.deleteById(created.id);

      assert.deepStrictEqual(await matchService.getAll(), []);
      assert.deepStrictEqual(await matchService.hasUnfinished(), {
        has: 0,
      });
      assert.deepStrictEqual(await new CourtService().getAll(), [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
      ]);
      assert.deepStrictEqual(await matchService.getAllUnfinished(), []);
    });
  });

  // строка протокола матча
  interface ProtocolRow {
    match_id: number;
    game_id: number;
    court: number;
    name1: string;
    name2: string;
    name3: string;
    name4: string;
    lost_1_by: number;
    lost_2_by: number;
    rating1: number;
    rating2: number;
    delta1: number;
  }

  type Protocol = Record<string, Record<string, ProtocolRow[]>>[];

  // добавляет игры в матч (каждая — [lost_1_by, lost_2_by]); когда число
  // проигранных геймов одной стороны достигает wins, матч завершает триггер
  const finishMatch = async (
    matchId: number,
    games: [lost1: string | null, lost2: string | null][],
  ): Promise<void> => {
    for (const [lost1, lost2] of games) {
      await gameService.create(matchId, lost1, lost2, "2026-01-01 10:00:00");
    }
  };

  const createUsers = async (ratings: number[]): Promise<number[]> => {
    const userService = new UserService();
    const names: [string, string][] = [
      ["Тестов", "Алексей"],
      ["Смирнов", "Борис"],
      ["Кузнецова", "Вера"],
      ["Попов", "Григорий"],
    ];
    const ids: number[] = [];
    for (const [i, rating] of ratings.entries()) {
      const { id } = await userService.create(names[i][0], names[i][1], "Отчество", rating, 1, 1, "1990-01-01");
      ids.push(id);
    }
    await userService.registerByIds(ids);
    return ids;
  };

  describe("getAllFinishedAtLastSession", () => {
    it("должен вернуть протокол завершённого матча, сгруппированный по играм", async () => {
      const ids = await seedMatchUsers();
      await matchService.create(...(ids as [number, number, number, number]));
      const matchId = (await matchService.getAll() as MatchRow[])[0].id;
      await finishMatch(matchId, [["15", null], ["17", null]]);

      const protocol = await matchService.getAllFinishedAtLastSession() as unknown as Protocol;

      assert.strictEqual(protocol.length, 1);
      const games = protocol[0][String(matchId)]!;
      assert.strictEqual(Object.keys(games).length, 2);

      const [firstGame] = Object.values(games)[0];
      assert.strictEqual(firstGame.match_id, matchId);
      assert.strictEqual(firstGame.court, 1);
      assert.strictEqual(firstGame.name1, "Тестов Алексей");
      assert.strictEqual(firstGame.name2, "Смирнов Борис");
      assert.strictEqual(firstGame.name3, "Кузнецова Вера");
      assert.strictEqual(firstGame.name4, "Попов Григорий");
      assert.strictEqual(firstGame.lost_1_by, 15); // записанный счёт выводится как есть
      assert.strictEqual(firstGame.lost_2_by, 21); // 15 < game_point-1 → победа game_point
      assert.strictEqual(firstGame.rating1, 500); // средний рейтинг пары до матча
      assert.strictEqual(firstGame.rating2, 500);
      assert.strictEqual(firstGame.delta1, -10); // при равных рейтингах проигравший получает -10
    });

    it("должен выводить счёт по правилам бадминтона", async () => {
      const ids = await seedMatchUsers();
      // [геймы матча] → [выведенный lost_1_by, выведенный lost_2_by]:
      // незаписанный счёт проигравшего вычисляется из записанного
      const cases: [[string | null, string | null], [number, number]][] = [
        [[null, "10"], [21, 10]], // 10 < 20 → 21:10
        [[null, "20"], [22, 20]], // 20..28 → +2
        [[null, "28"], [30, 28]],
        [[null, "29"], [30, 29]], // 29 = max_point-1 → 30
        [["21", null], [21, 23]], // записанный 21, второй вычислен как 21+2
      ];

      for (const [games] of cases) {
        await matchService.create(...(ids as [number, number, number, number]));
        // getAll() без ORDER BY возвращает от старых к новым — нужен последний
        const id = (await matchService.getAll() as MatchRow[]).at(-1)!.id;
        await finishMatch(id, [games, games]); // две одинаковые игры завершают матч
      }

      const protocol = await matchService.getAllFinishedAtLastSession() as unknown as Protocol;
      assert.strictEqual(protocol.length, cases.length);

      const scores = protocol.map((m) => {
        const rows = Object.values(Object.values(m)[0]!)[0];
        return [rows[0].lost_1_by, rows[0].lost_2_by];
      }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

      assert.deepStrictEqual(scores, [[21, 10], [21, 23], [22, 20], [30, 28], [30, 29]]);
    });
  });

  describe("getAllByUser", () => {
    it("должен вернуть матчи пользователя в любой из позиций", async () => {
      const userService = new UserService();
      const ids: number[] = [];
      for (const u of users) {
        const { id } = await userService.create(u.lastname, u.firstname, "Отчество", 500, 1, 1, "1990-01-01");
        ids.push(id);
      }
      // ещё 4 пользователя: трое во втором матче, четвёртый — ни в одном
      const extra: number[] = [];
      for (const [ln, fn] of [["Ефимов", "Дмитрий"], ["Захарова", "Елена"], ["Иванов", "Фёдор"], ["Петрова", "Ольга"]] as [string, string][]) {
        const { id } = await userService.create(ln, fn, "Отчество", 500, 1, 1, "1990-01-01");
        extra.push(id);
      }

      await matchService.create(ids[0], ids[1], ids[2], ids[3]);
      const first = (await matchService.getAll() as MatchRow[]).at(-1)!.id;
      await finishMatch(first, [["15", null], ["15", null]]);

      await matchService.create(ids[0], extra[0], extra[1], extra[2]);
      const second = (await matchService.getAll() as MatchRow[]).at(-1)!.id;
      await finishMatch(second, [["15", null], ["15", null]]);

      const all = await matchService.getAllByUser(ids[0]) as unknown as Protocol;
      // каждый элемент массива — объект с одним ключом match_id;
      // строки приходят ORDER BY m.id DESC — от новых к старым
      const idsOf = (list: Protocol) => list.map((m) => Number(Object.keys(m)[0]));
      // порядок групп не гарантирован (числоподобные ключи итерируются
      // по возрастанию) — сравниваем отсортированным от новых к старым
      assert.deepStrictEqual(idsOf(all).sort((a, b) => b - a), [second, first]);

      const own = await matchService.getAllByUser(ids[3]) as unknown as Protocol;
      assert.deepStrictEqual(idsOf(own), [first]);

      assert.deepStrictEqual(await matchService.getAllByUser(extra[3]), []);
    });
  });

  describe("дельты рейтинга", () => {
    it("должен дать нулевую дельту при разнице средних рейтингов 100 и больше", async () => {
      const ids = await createUsers([400, 400, 600, 600]);

      await matchService.create(...(ids as [number, number, number, number]));
      const matchId = (await matchService.getAll() as MatchRow[])[0].id;
      await finishMatch(matchId, [["15", null], ["15", null]]); // команда 1 проиграла

      const rows = db.all<{ user_id: number; previous: number; delta: number }>(
        "SELECT user_id, previous, delta FROM rating WHERE match_id = ? ORDER BY user_id",
        [matchId],
      );

      assert.deepStrictEqual(rows, [
        { user_id: ids[0], previous: 400, delta: 0 },
        { user_id: ids[1], previous: 400, delta: 0 },
        { user_id: ids[2], previous: 600, delta: 0 },
        { user_id: ids[3], previous: 600, delta: 0 },
      ]);
    });

    it("должен считать дельты и при проигрыше команды 2 (в обратную сторону)", async () => {
      const ids = await createUsers([450, 450, 400, 400]);

      await matchService.create(...(ids as [number, number, number, number]));
      const matchId = (await matchService.getAll() as MatchRow[])[0].id;
      await finishMatch(matchId, [[null, "15"], [null, "15"]]); // команда 2 проиграла

      const rows = db.all<{ user_id: number; previous: number; delta: number }>(
        "SELECT user_id, previous, delta FROM rating WHERE match_id = ? ORDER BY user_id",
        [matchId],
      );

      // diff = avg(1,2) - avg(3,4) = 50; победители +5, проигравшие -5
      assert.deepStrictEqual(rows, [
        { user_id: ids[0], previous: 450, delta: 5 },
        { user_id: ids[1], previous: 450, delta: 5 },
        { user_id: ids[2], previous: 400, delta: -5 },
        { user_id: ids[3], previous: 400, delta: -5 },
      ]);
    });
  });
});
