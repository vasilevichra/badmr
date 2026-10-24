import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import SettingsService from "../../src/services/settings.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

interface Setting {
  name: string;
  value: string;
  description: string;
}

interface Region {
  id: number;
  state_id: number;
  name: string;
  timezone: string | null;
  is_default: number;
}

interface City {
  id: number;
  region_id: number;
  name: string;
  is_default: number;
}

const settingsService = new SettingsService();
const db = new Repository().db;

describe("Settings", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("get", () => {
    it("должен вернуть значение настройки текущего турнира", async () => {
      assert.strictEqual(await settingsService.get("delta"), "100");
    });

    it("должен вернуть значение по умолчанию, когда настройка не переопределена", async () => {
      assert.strictEqual(await settingsService.get("state"), "1");
    });
  });

  describe("getAll", () => {
    it("должен вернуть все настройки с описаниями", async () => {
      const all = await settingsService.getAll() as unknown as Setting[];

      // 24 базовых настройки + 4 настройки калибровки рейтинга + fifty
      // + 2 параметра формулы дельты (rating_diff_limit, rating_diff_divisor)
      // + delta_auto
      assert.strictEqual(all.length, 32);
      assert.ok(all.every((s) => "name" in s && "value" in s && "description" in s));
      assert.deepStrictEqual<Setting[]>(
        all.filter((s) => s.name === "delta"),
        [{ name: "delta", value: "100", description: "Максимальная разница в сумме рейтингов пар при их формировании" }]
      );
      assert.deepStrictEqual<Setting[]>(
        all.filter((s) => s.name === "state"),
        [{ name: "state", value: "1", description: "Страна по умолчанию при добавлении новых игроков" }]
      );
    });
  });

  describe("getSettings", () => {
    it("должен вернуть объект настроек текущего турнира", async () => {
      const settings = await settingsService.getSettings() as Record<string, string>;

      assert.strictEqual(Object.keys(settings).length, 32);
      assert.strictEqual(settings.delta, "100");
      assert.strictEqual(settings.state, "1");
      assert.strictEqual(settings.type, "1");
    });
  });

  describe("getTimezone", () => {
    it("должен вернуть IANA-имя пояса по id из справочника timezone", async () => {
      // в тестовой БД settings.timezone = '1' — id, а не имя зоны
      assert.strictEqual(await settingsService.getTimezone(), "Europe/Moscow");
    });
  });

  describe("getDefaults", () => {
    it("должен вернуть объект значений по умолчанию без переопределений", async () => {
      const defaults = await settingsService.getDefaults() as Record<string, string>;

      assert.strictEqual(Object.keys(defaults).length, 32);
      assert.strictEqual(defaults.delta, "50");
      assert.strictEqual(defaults.state, "1");
    });
  });

  describe("states", () => {
    it("должен пометить состояние по умолчанию", async () => {
      assert.deepStrictEqual(await settingsService.states(), [
        { id: 1, name: "Россия", is_default: 1 },
      ]);
    });
  });

  describe("regions", () => {
    it("должен пометить регион по умолчанию", async () => {
      const regions = await settingsService.regions() as unknown as Region[];

      assert.deepStrictEqual<Region[]>(
        regions.filter((r) => r.is_default === 1),
        [{ id: 33, state_id: 1, name: "Владимирская область", timezone: "Europe/Moscow", is_default: 1 }]
      );
      assert.strictEqual(regions.length, 90);
    });
  });

  describe("cities", () => {
    it("должен пометить город по умолчанию", async () => {
      const cities = await settingsService.cities() as unknown as City[];

      assert.deepStrictEqual<City[]>(cities.filter((c) => c.is_default === 1), [
        // cities() возвращает c.* из таблицы city: id, region_id, name (+ is_default), state_id живёт в region
        { id: 1, region_id: 33, name: "Доброград", is_default: 1 },
      ]);
      assert.strictEqual(cities.length, 8);
    });
  });

  // констрейнты значений из схемы (01-tables-up.sql): CHECK нижних границ
  // и триггеры перекрёстных ограничений; отклонённый UPDATE данных не меняет
  describe("constraints", () => {
    const assertRejected = (sql: string, message: RegExp) => {
      assert.throws(() => db.exec(sql), message);
    };

    it("должен отклонить нецелочисленное значение обычной настройки", () => {
      assertRejected("UPDATE defaults SET value = 'abc' WHERE name = 'delta'", /CHECK constraint failed/);
    });

    it("должен отклонить отрицательное значение", () => {
      assertRejected("UPDATE defaults SET value = '-1' WHERE name = 'delta'", /CHECK constraint failed/);
    });

    it("должен отклонить значение ниже нижней границы", () => {
      assertRejected("UPDATE defaults SET value = '0' WHERE name = 'wins'", /CHECK constraint failed/);
      assertRejected("UPDATE defaults SET value = '0' WHERE name = 'fee'", /CHECK constraint failed/);
      assertRejected("UPDATE defaults SET value = '0' WHERE name = 'H_max'", /CHECK constraint failed/);
      assertRejected("UPDATE defaults SET value = '0' WHERE name = 'r_min'", /CHECK constraint failed/);
    });

    it("должен отклонить нечисловой priority", () => {
      assertRejected("UPDATE defaults SET value = 'played,matches,diff' WHERE name = 'priority'", /CHECK constraint failed/);
    });

    it("должен принять priority со списком id через запятую", () => {
      db.exec("UPDATE defaults SET value = '1,2,3' WHERE name = 'priority'");
      db.exec("UPDATE defaults SET value = '3,2,1,4' WHERE name = 'priority'"); // возврат сида
    });

    it("должен отклонить max_point не больше game_point", () => {
      assertRejected("UPDATE defaults SET value = '21' WHERE name = 'max_point'", /max_point должен быть больше game_point/);
      assertRejected("UPDATE defaults SET value = '30' WHERE name = 'game_point'", /max_point должен быть больше game_point/);
    });

    it("должен отклонить нарушение цепочки групп", () => {
      assertRejected("UPDATE defaults SET value = '700' WHERE name = 'B_max'", /B_max должен быть больше C_max/);
      assertRejected("UPDATE defaults SET value = '250' WHERE name = 'G_max'", /G_max должен быть больше H_max/);
    });

    it("должен отклонить r_min больше r_max", () => {
      assertRejected("UPDATE defaults SET value = '800' WHERE name = 'r_min'", /r_max должен быть не меньше r_min/);
    });

    it("должен принять валидные значения", () => {
      db.exec("UPDATE defaults SET value = '910' WHERE name = 'B_max'");
      db.exec("UPDATE defaults SET value = '40' WHERE name = 'max_point'");
      db.exec("UPDATE defaults SET value = '30' WHERE name = 'max_point'"); // возврат сида
      db.exec("UPDATE defaults SET value = '900' WHERE name = 'B_max'"); // возврат сида
    });
  });
});
