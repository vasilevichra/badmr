import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import GroupService from "../../src/services/group.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const groupService = new GroupService();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

interface PlayerSpec {
  sex: number;
  rating1?: number | null;
  rating2?: number | null;
}

let seedSeq = 0;
/** Команда с игроками в группе 5 текущего турнира (4); цвет — из
 *  существующих team_color (1-12): getAll джойнит team_color. */
const seedTeam = async (groupId: number, players: PlayerSpec[]) => {
  const team = teamService.create(4, groupId, `Группа ${++seedSeq}`, 1, (seedSeq - 1) % 12 + 1)!;
  for (const [i, p] of players.entries()) {
    const user = await userService.create(`Игрок${i}`, "Группа", "", 500, p.sex, 1, "1990-01-01");
    teamUserService.create(team.id, user.id, groupId);
    const ratings = [p.rating1, p.rating2].filter((v): v is number => v !== undefined);
    if (ratings.length) {
      db.run("INSERT INTO user_lab (user_id, rating_1, rating_2) VALUES (?, ?, ?)",
          [user.id, p.rating1 ?? null, p.rating2 ?? null]);
    }
  }
  return team.id;
};

/** Идентификаторы команд в порядке следования в ответе getAll для группы. */
const teamOrder = (groups: ReturnType<GroupService["getAll"]>, groupId: number) => {
  const group = groups.find(g => Object.keys(g)[0] === String(groupId));
  return Object.keys(group?.[groupId] ?? {}).map(k => Number(k.replace("team_", "")));
};

describe("Group.getAll", () => {
  beforeEach(async () => {
    await clean();
  });

  it("должен вернуть пустой список без команд в текущем турнире", () => {
    assert.deepStrictEqual(groupService.getAll(), []);
  });

  it("должен сеять команды группы по силе (средний рейтинг лаб игроков)", async () => {
    // сила: (400+500)/2 = 450; (300+400)/2 = 350; без лаба — в конце
    const strong = await seedTeam(5, [{sex: 1, rating1: 400, rating2: 500}]);
    const middle = await seedTeam(5, [{sex: 1, rating1: 300, rating2: 400}]);
    const weak = await seedTeam(5, [{sex: 1}]);

    const groups = groupService.getAll();

    assert.strictEqual(groups.length, 1);
    assert.deepEqual(teamOrder(groups, 5), [strong, middle, weak]);
  });

  it("должен сортировать игроков внутри команды по убыванию рейтинга", async () => {
    const team = await seedTeam(5, [
      {sex: 0, rating1: 200, rating2: null},
      {sex: 1, rating1: 600, rating2: 700},
      {sex: 1, rating1: 300, rating2: null},
    ]);

    const groups = groupService.getAll();
    const players = (groups[0]![5]![`team_${team}`] ?? []) as { user_lab_rating_1: number }[];

    assert.deepEqual(players.map(p => p.user_lab_rating_1), [600, 300, 200]);
  });

  it("должен пропускать группы других турниров", async () => {
    // группа 7 фикстуры — команды турнира 2, не текущего
    await seedTeam(5, [{sex: 1}]);

    const groups = groupService.getAll();

    assert.strictEqual(groups.length, 1);
    assert.ok(Object.keys(groups[0]!)[0] === "5");
  });
});
