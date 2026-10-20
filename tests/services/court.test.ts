import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import CourtService from "../../src/services/court.ts";
import MatchService from "../../src/services/match.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";

interface CourtRow {
  id: number;
  number: number;
  available: number;
}

interface CourtFullRow extends CourtRow {
  tournament_id: number;
}

const courtService = new CourtService();
const matchService = new MatchService();

// создаёт 4 пользователей и регистрирует их на текущий турнир,
// после чего создаёт матч (он встаёт на корт 11, номер 1)
const seedMatch = async (): Promise<void> => {
  const userService = new UserService();
  const ids: number[] = [];
  for (const u of ["Тестов", "Смирнов", "Кузнецова", "Попов"]) {
    const { id } = await userService.create(u, "Имя", "Отчество", 500, 1, 1, "1990-01-01");
    ids.push(id);
  }
  await userService.registerByIds(ids);
  await matchService.create(...(ids as [number, number, number, number]));
};

// в тестовой БД текущий турнир id=4 ('Новая Лига') с кортами id 11-13 (номера 1-3)
describe("Court", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("create", () => {
    it("должен создать корт в текущем турнире", async () => {
      await courtService.create();

      assert.deepStrictEqual<CourtRow[]>(await courtService.getAll(), [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
        { id: 14, number: 4, available: 1 },
      ]);
    });
  });

  describe("getAll", () => {
    it("должен вернуть все корты текущего турнира", async () => {
      assert.deepStrictEqual<CourtRow[]>(await courtService.getAll(), [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
      ]);
    });
  });

  describe("getById", () => {
    it("должен вернуть корт по id", async () => {
      assert.deepStrictEqual<CourtFullRow | undefined>(await courtService.getById(11), {
        id: 11,
        tournament_id: 4,
        number: 1,
        available: 1,
      });
    });
  });

  describe("disable", () => {
    it("должен сделать корт недоступным", async () => {
      await courtService.disable(1);

      assert.deepStrictEqual<CourtFullRow | undefined>(await courtService.getById(11), {
        id: 11,
        tournament_id: 4,
        number: 1,
        available: 0,
      });
    });
  });

  describe("disableAll", () => {
    it("должен сделать все корты недоступными", async () => {
      await courtService.create();
      await courtService.disableAll();

      assert.deepStrictEqual<CourtRow[]>(await courtService.getAll(), [
        { id: 11, number: 1, available: 0 },
        { id: 12, number: 2, available: 0 },
        { id: 13, number: 3, available: 0 },
        { id: 14, number: 4, available: 0 },
      ]);
    });
  });

  describe("enable", () => {
    it("должен сделать корт доступным", async () => {
      await courtService.disableAll();
      await courtService.enable(1);

      assert.deepStrictEqual<CourtFullRow | undefined>(await courtService.getById(11), {
        id: 11,
        tournament_id: 4,
        number: 1,
        available: 1,
      });
    });
  });

  describe("enableAll", () => {
    it("должен сделать все корты доступными", async () => {
      await courtService.create();
      await courtService.disableAll();
      await courtService.enableAll();

      assert.deepStrictEqual<CourtRow[]>(await courtService.getAll(), [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
        { id: 14, number: 4, available: 1 },
      ]);
    });
  });

  describe("enable с идущей игрой (issue #13)", () => {
    it("должен отклонить активацию корта с незавершённым матчем", async () => {
      await seedMatch();
      // триггер создания матча пометил корт 11 (номер 1) недоступным
      assert.strictEqual((await courtService.getById(11))!.available, 0);

      await assert.rejects(courtService.enable(1), /На корте №1 идёт игра/);
      assert.strictEqual((await courtService.getById(11))!.available, 0);
    });

    it("должен разрешить активацию после удаления матча", async () => {
      await seedMatch();
      const created = (await matchService.getAll() as { id: number }[])[0];

      await matchService.deleteById(created.id);
      await courtService.enable(1);

      assert.strictEqual((await courtService.getById(11))!.available, 1);
    });
  });

  describe("enableAll с идущей игрой (issue #13)", () => {
    it("должен включить свободные корты и не тронуть корт с игрой", async () => {
      await courtService.create();
      await seedMatch();
      // корт 11 занят матчем (available=0), корты 12-14 свободны

      await courtService.enableAll();

      assert.deepStrictEqual<CourtRow[]>(await courtService.getAll(), [
        { id: 11, number: 1, available: 0 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
        { id: 14, number: 4, available: 1 },
      ]);
    });
  });

  describe("countAvailable", () => {
    it("должен вернуть количество доступных кортов", async () => {
      await courtService.create();

      assert.strictEqual(await courtService.countAvailable(), 4);
    });

    it("должен вернуть 0 когда все корты недоступны", async () => {
      await courtService.disableAll();

      assert.strictEqual(await courtService.countAvailable(), 0);
    });
  });

  describe("delete", () => {
    it("должен удалить корт по id", async () => {
      await courtService.create();
      await courtService.delete(14);

      assert.deepStrictEqual<CourtRow[]>(await courtService.getAll(), [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
      ]);
    });
  });

  describe("deleteAll", () => {
    it("должен удалить все корты текущего турнира", async () => {
      await courtService.create();
      await courtService.deleteAll();

      assert.deepStrictEqual<CourtRow[]>(await courtService.getAll(), []);
      assert.strictEqual(await courtService.countAvailable(), 0);
    });
  });
});
