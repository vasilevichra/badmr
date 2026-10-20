import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import GymService from "../../src/services/gym.ts";
import { clean } from "../helpers/migration.ts";

interface IdText {
  id: number;
  text: string;
}

describe("Gym", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("select", () => {
    it("должен вернуть спортзалы клуба", async () => {
      assert.deepStrictEqual<IdText[]>(await new GymService().select(1), [
        { id: 1, text: "Гранд Арена" },
      ]);
    });

    it("должен вернуть все спортзалы без указания клуба", async () => {
      assert.deepStrictEqual<IdText[]>(await new GymService().select(), [
        { id: 1, text: "Гранд Арена" },
        { id: 2, text: "ДК в Решетихе" },
        { id: 3, text: "Цех" },
      ]);
    });

    it("должен вернуть пустой список когда у клуба нет спортзалов", async () => {
      assert.deepStrictEqual<IdText[]>(await new GymService().select(999), []);
    });
  });
});
