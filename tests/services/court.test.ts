import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import CourtService from "../../src/services/court.ts";
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
