import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import RegionService from "../../src/services/region.ts";
import StateService from "../../src/services/state.ts";
import TournamentTypeService from "../../src/services/tournament-type.ts";
import UserClubService from "../../src/services/user-club.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";

interface IdText {
  id: number;
  text: string;
}

interface IdName {
  id: number;
  name: string;
}

const regionService = new RegionService();
const stateService = new StateService();
const tournamentTypeService = new TournamentTypeService();
const userClubService = new UserClubService();
const userService = new UserService();

// повторное создание сервисов должно вернуть существующие singleton
assert.strictEqual(new RegionService(), regionService);
assert.strictEqual(new StateService(), stateService);
assert.strictEqual(new TournamentTypeService(), tournamentTypeService);
assert.strictEqual(new UserClubService(), userClubService);

const seedUser = async (): Promise<number> => {
  const { id } = await userService.create("Тестов", "Тест", "Тестович", 500, 1, 1, "1990-01-01");
  return id;
};

describe("Region", () => {
  beforeEach(async () => {
    console.log = function () {};
    await clean();
  });

  describe("select", () => {
    it("должен вернуть регионы страны", async () => {
      const regions = await regionService.select(1) as IdText[];

      assert.strictEqual(regions.length, 90);
      assert.ok(regions.some((r) => r.id === 33 && r.text === "Владимирская область"));
    });

    it("должен вернуть все регионы без указания страны", async () => {
      const regions = await regionService.select() as IdText[];

      assert.strictEqual(regions.length, 90);
    });

    it("должен вернуть пустой список для несуществующей страны", async () => {
      assert.deepStrictEqual(await regionService.select(999), []);
    });

    it("должен вернуть часовой пояс региона", async () => {
      const regions = await regionService.select(1) as (IdText & { timezone_id: number | null; timezone: string | null })[];

      assert.strictEqual(regions.length, 90);
      assert.strictEqual(regions.find((r) => r.id === 33)!.timezone_id, 1);
      assert.strictEqual(regions.find((r) => r.id === 33)!.timezone, "Europe/Moscow");
      assert.strictEqual(regions.find((r) => r.id === 66)!.timezone_id, 2);
      assert.strictEqual(regions.find((r) => r.id === 66)!.timezone, "Asia/Yekaterinburg");
      assert.strictEqual(regions.find((r) => r.id === 94)!.timezone_id, null);
      assert.strictEqual(regions.find((r) => r.id === 94)!.timezone, null);
    });
  });

  describe("getById", () => {
    it("должен вернуть регион по id", async () => {
      assert.deepStrictEqual<IdName | undefined>(await regionService.getById(33), {
        id: 33,
        name: "Владимирская область",
      });
    });

    it("должен вернуть пустой ответ для несуществующего региона", async () => {
      assert.strictEqual(await regionService.getById(999), undefined);
    });
  });

  describe("getByUserId", () => {
    it("должен вернуть регион пользователя", async () => {
      const id = await seedUser();

      assert.deepStrictEqual<IdName | undefined>(await regionService.getByUserId(id), {
        id: 33,
        name: "Владимирская область",
      });
    });

    it("должен вернуть пустой ответ для несуществующего пользователя", async () => {
      assert.strictEqual(await regionService.getByUserId(999), undefined);
    });
  });
});

describe("State", () => {
  beforeEach(async () => {
    console.log = function () {};
    await clean();
  });

  describe("select", () => {
    it("должен вернуть все страны", async () => {
      assert.deepStrictEqual<IdText[]>(await stateService.select(), [
        { id: 1, text: "Россия" },
      ]);
    });
  });

  describe("getById", () => {
    it("должен вернуть страну по id", async () => {
      assert.deepStrictEqual<IdName | undefined>(await stateService.getById(1), {
        id: 1,
        name: "Россия",
      });
    });

    it("должен вернуть пустой ответ для несуществующей страны", async () => {
      assert.strictEqual(await stateService.getById(999), undefined);
    });
  });

  describe("getByUserId", () => {
    it("должен вернуть страну пользователя", async () => {
      const id = await seedUser();

      assert.deepStrictEqual<IdName | undefined>(await stateService.getByUserId(id), {
        id: 1,
        name: "Россия",
      });
    });

    it("должен вернуть пустой ответ для несуществующего пользователя", async () => {
      assert.strictEqual(await stateService.getByUserId(999), undefined);
    });
  });
});

describe("TournamentType", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("select", () => {
    it("должен вернуть все типы турниров", async () => {
      assert.deepStrictEqual<IdText[]>(await tournamentTypeService.select(), [
        { id: 1, text: "Новая лига" },
        { id: 2, text: "110" },
      ]);
    });
  });
});

describe("UserClub", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("select", () => {
    it("должен вернуть все клубы", async () => {
      const clubs = (await userClubService.select()) as IdText[];
      // порядок строк без ORDER BY не гарантирован — сравниваем отсортированным
      assert.deepStrictEqual<IdText[]>(clubs.sort((a, b) => a.id - b.id), [
        { id: 1, text: "БК Доброград" },
        { id: 2, text: "DZR club" },
        { id: 3, text: "Цех №1" },
      ]);
    });
  });
});
