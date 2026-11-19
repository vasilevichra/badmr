import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import BracketHistory from "../../src/services/bracket-history.ts";
import Match110Repository from "../../src/repositories/match110.ts";
import Game110Repository from "../../src/repositories/game110.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const history = new BracketHistory();
const match110 = new Match110Repository();
const game110 = new Game110Repository();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

let colorSeq = 0;

// котлы фикстуры: группа 5 = 'C', группа 7 = 'D'
const GROUP_C = 5;
const GROUP_D = 7;

const seedTeam = async (name: string, groupId: number): Promise<number> => {
  const { id: userId } = await userService.create(name, "Игрок", "Отчество", 500, 1, 1, "1990-01-01");
  const { id: teamId } = teamService.create(4, groupId, name, 1, (colorSeq++ % 12) + 1);
  teamUserService.create(teamId, userId, groupId);
  return teamId;
};

// завершённый матч 110 с фиксированным счётом (без слотов — историческая матрица)
const play = (a: number, b: number, scoreA: number, scoreB: number): number => {
  const { id } = match110.create(a, b, 4);
  game110.create(id);
  db.run(`UPDATE game_110 SET score_1 = ?, score_2 = ? WHERE match_110_id = ?`,
      [scoreA, scoreB, id]);
  db.run(`UPDATE match_110 SET finished = 1 WHERE id = ?`, [id]);
  return id;
};

// начатый, но не завершённый матч
const start = (a: number, b: number): number => {
  const { id } = match110.create(a, b, 4);
  game110.create(id);
  return id;
};

describe("BracketHistory (историческая сетка архива 110)", () => {
  beforeEach(async () => {
    await clean();
    colorSeq = 0;
  });

  it("реконструкция: котлы C и D, раунды по цепочке матчей, победитель по счёту", async () => {
    const c1 = await seedTeam("C1", GROUP_C);
    const c2 = await seedTeam("C2", GROUP_C);
    const c3 = await seedTeam("C3", GROUP_C);
    const c4 = await seedTeam("C4", GROUP_C);
    const d1 = await seedTeam("D1", GROUP_D);
    const d2 = await seedTeam("D2", GROUP_D);
    const d3 = await seedTeam("D3", GROUP_D);

    play(c1, c2, 110, 80);  // котёл C, круг 1
    play(c3, c4, 90, 110);  // котёл C, круг 1
    play(c1, c4, 110, 70);  // котёл C, круг 2 (оба уже играли)
    play(d1, d2, 100, 110); // котёл D, круг 1
    play(d2, d3, 110, 50);  // котёл D, круг 2 (d2 играл, d3 — нет)
    const unfinishedId = start(c2, c3); // котёл C, круг 2, не завершён

    const data = history.historical110(4);
    assert.deepStrictEqual(data.pockets.map(p => p.name), ['C', 'D']);

    const pocketC = data.pockets[0];
    assert.strictEqual(pocketC.rounds.length, 2);
    assert.strictEqual(pocketC.rounds[0].length, 2);
    assert.strictEqual(pocketC.rounds[1].length, 2);
    const finishedR2 = pocketC.rounds[1].find(m => m.finished === 1)!;
    assert.strictEqual(finishedR2.id, 3);
    assert.strictEqual(finishedR2.winner_id, c1);
    assert.strictEqual(finishedR2.team_1.name, 'C1');
    assert.strictEqual(typeof finishedR2.team_1.city, 'string');
    const unfinished = pocketC.rounds[1].find(m => m.id === unfinishedId)!;
    assert.strictEqual(unfinished.finished, 0);
    assert.strictEqual(unfinished.winner_id, null);
    // победитель по счёту: во втором матче круга 1 выиграла команда 2
    assert.strictEqual(pocketC.rounds[0][1].winner_id, c4);

    const pocketD = data.pockets[1];
    assert.strictEqual(pocketD.rounds.length, 2);
    assert.strictEqual(pocketD.rounds[0].length, 1);
    assert.strictEqual(pocketD.rounds[1].length, 1);
    assert.strictEqual(pocketD.rounds[1][0].winner_id, d2);
  });

  it("котёл без матчей входит с пустыми раундами; матчи без игрового счёта не падают", async () => {
    const c1 = await seedTeam("C1", GROUP_C);
    const c2 = await seedTeam("C2", GROUP_C);
    await seedTeam("D1", GROUP_D);
    await seedTeam("D2", GROUP_D);
    play(c1, c2, 110, 80);
    const data = history.historical110(4);
    assert.deepStrictEqual(data.pockets.map(p => p.name), ['C', 'D']);
    assert.strictEqual(data.pockets[0].rounds.length, 1);
    assert.strictEqual(data.pockets[1].rounds.length, 0);
  });
});
