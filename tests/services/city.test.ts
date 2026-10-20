import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import CityService from "../../src/services/city.ts";
import TeamService from "../../src/services/team.ts";
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

const cityService = new CityService();

describe("City", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("select", () => {
    it("должен вернуть города региона", async () => {
      assert.deepStrictEqual<IdText[]>(await cityService.select(33), [
        { id: 6, text: "Владимир" },
        { id: 1, text: "Доброград" },
        { id: 4, text: "Ковров" },
      ]);
    });

    it("должен вернуть все города без указания региона", async () => {
      assert.deepStrictEqual<IdText[]>(await cityService.select(), [
        { id: 1, text: "Доброград" },
        { id: 2, text: "Санкт-Петербург" },
        { id: 3, text: "Москва" },
        { id: 4, text: "Ковров" },
        { id: 5, text: "Иваново" },
        { id: 6, text: "Владимир" },
        { id: 7, text: "Дзержинск" },
        { id: 8, text: "Нижний Новгород" },
      ]);
    });

    it("должен вернуть пустой список для несуществующего региона", async () => {
      assert.deepStrictEqual<IdText[]>(await cityService.select(999), []);
    });
  });

  describe("getById", () => {
    it("должен вернуть город по id", async () => {
      assert.deepStrictEqual<IdName | undefined>(await cityService.getById(3), { id: 3, name: "Москва" });
    });

    it("должен вернуть пустой ответ для несуществующего города", async () => {
      assert.strictEqual(await cityService.getById(999), undefined);
    });
  });

  describe("getByTeamId", () => {
    it("должен вернуть город команды", async () => {
      const { id } = await new TeamService().create(1, 1, "Тестовая команда", 3, 1);

      assert.deepStrictEqual<IdName | undefined>(await cityService.getByTeamId(id!), { id: 3, name: "Москва" });
    });

    it("должен вернуть пустой ответ для команды без города", async () => {
      assert.strictEqual(await cityService.getByTeamId(999), undefined);
    });
  });

  describe("findByName", () => {
    it("должен вернуть город по названию", async () => {
      assert.deepStrictEqual(await cityService.findByName("Москва"), {
        id: 3,
        name: "Москва",
        region_id: 77,
        state_id: 1,
      });
    });

    it("должен вернуть пустой ответ для неизвестного названия", async () => {
      assert.strictEqual(await cityService.findByName("Атлантида"), undefined);
    });
  });

  describe("getByUserId", () => {
    it("должен вернуть город пользователя", async () => {
      const userService = new UserService();
      const { id } = await userService.create("Тестов", "Алексей", "Отчество", 500, 1, 3, "1990-01-01");

      assert.deepStrictEqual(await cityService.getByUserId(id), {
        id: 3,
        name: "Москва",
      });
    });

    it("должен вернуть пустой ответ для пользователя без города", async () => {
      const userService = new UserService();
      const { id } = await userService.create("Тестов", "Алексей", "Отчество", 500, 1, 999, "1990-01-01");

      assert.strictEqual(await cityService.getByUserId(id), undefined);
    });
  });
});
