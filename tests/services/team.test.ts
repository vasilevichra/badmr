import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

interface TeamRow {
  id: number;
  tournament_id: number;
  group_id: number;
  name: string;
  city_id: number;
  team_color_id: number;
}

interface TeamUserRow {
  id: number;
  team_id: number;
  user_id: number;
  group_id: number;
}

const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

describe("Team", () => {
  beforeEach(async () => {
    await clean();
  });

  it("повторное создание сервиса должно вернуть существующий singleton", () => {
    assert.strictEqual(new TeamService(), teamService);
    assert.strictEqual(new TeamUserService(), teamUserService);
  });

  describe("create", () => {
    it("должен создать команду в турнире", () => {
      const id = teamService.create(4, 1, "Молния", 1, 3);

      const row = db.get<TeamRow>("SELECT * FROM team WHERE id = ?", [id!.id])!;
      assert.deepStrictEqual(row, {
        id: row.id,
        tournament_id: 4,
        group_id: 1,
        name: "Молния",
        city_id: 1,
        team_color_id: 3,
      });
    });
  });

  describe("setCity, setName", () => {
    it("должен обновить город и имя команды", () => {
      const { id } = teamService.create(4, 2, "Вихрь", 1, 5)!;

      teamService.setCity(id, 2);
      teamService.setName(id, "Ураган");

      const row = db.get<TeamRow>("SELECT * FROM team WHERE id = ?", [id])!;
      assert.strictEqual(row.city_id, 2);
      assert.strictEqual(row.name, "Ураган");
    });
  });

  describe("TeamUser create, setGroupId", () => {
    it("должен добавить пользователя в команду и перевести в другую группу", async () => {
      const { id } = await userService.create("Тестов", "Алексей", "Отчество", 500, 1, 1, "1990-01-01");
      const team = teamService.create(4, 1, "Молния", 1, 3)!;

      teamUserService.create(team.id, id, 2);

      const row = db.get<TeamUserRow>(
        "SELECT * FROM team_user WHERE team_id = ? AND user_id = ?",
        [team.id, id],
      )!;
      assert.deepStrictEqual(row, { id: row.id, team_id: team.id, user_id: id, group_id: 2 });

      teamUserService.setGroupId(team.id, id, 5);

      const updated = db.get<TeamUserRow>(
        "SELECT * FROM team_user WHERE team_id = ? AND user_id = ?",
        [team.id, id],
      )!;
      assert.strictEqual(updated.group_id, 5);
    });
  });
});
