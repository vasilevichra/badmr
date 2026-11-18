import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import StandingsService from "../../src/services/standings.ts";
import Match110Repository from "../../src/repositories/match110.ts";
import Game110Repository from "../../src/repositories/game110.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const standings = new StandingsService();
const match110 = new Match110Repository();
const game110 = new Game110Repository();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

let colorSeq = 0;

// команда с одним игроком; рейтинг игрока задаёт силу (сеяние)
const seedTeam = async (name: string, rating: number, groupId = 1): Promise<number> => {
  const { id: userId } = await userService.create(name, "Игрок", "Отчество", 500, 1, 1, "1990-01-01");
  db.run(`INSERT INTO user_lab (user_id, rating_1) VALUES (?, ?)`, [userId, rating]);
  const { id: teamId } = teamService.create(4, groupId, name, 1, (colorSeq++ % 12) + 1);
  teamUserService.create(teamId, userId, groupId);
  return teamId;
};

// завершённый матч 110 с фиксированным счётом (без роутинга сетки)
const play = (a: number, b: number, scoreA: number, scoreB: number, groupId = 1): void => {
  const { id } = match110.create(a, b, 4);
  game110.create(id);
  db.run(`UPDATE game_110 SET score_1 = ?, score_2 = ? WHERE match_110_id = ?`,
      [scoreA, scoreB, id]);
  db.run(`UPDATE match_110 SET finished = 1 WHERE id = ?`, [id]);
};

describe("Standings (сводная таблица 110)", () => {
  beforeEach(async () => {
    await clean();
    colorSeq = 0;
  });

  it("круг из трёх: равные очки, порядок по diff, при равном diff — по сеянию", async () => {
    const a = await seedTeam("А", 100);
    const b = await seedTeam("Б", 90);
    const c = await seedTeam("В", 80);
    // все по 1 победе; diff: A +30−20=+10, B −30+40=+10, C +20−40=−20
    play(a, b, 110, 80);
    play(b, c, 110, 70);
    play(c, a, 110, 90);

    const rows = standings.standings(4);
    assert.deepStrictEqual(rows.map(r => r.team_id), [a, b, c]);
    assert.deepStrictEqual(
        rows.map(r => [r.games, r.wins, r.losses, r.points, r.diff]),
        [[2, 1, 1, 1, 10], [2, 1, 1, 1, 10], [2, 1, 1, 1, -20]]
    );
  });

  it("личная встреча ставит победителя выше при равных очках, вопреки diff", async () => {
    const a = await seedTeam("А", 100);
    const b = await seedTeam("Б", 90);
    const c = await seedTeam("В", 80);
    const d = await seedTeam("Г", 70);
    const e = await seedTeam("Д", 60);
    play(a, b, 110, 80); // личная: A выше B
    play(b, c, 110, 80);
    play(c, d, 110, 80);
    play(d, a, 110, 80);
    play(a, e, 110, 80); // diff A: +30−30+30 = +30
    play(b, e, 110, 5);  // diff B: −30+30+105 = +105 — больше, но личная решает

    const rows = standings.standings(4);
    assert.deepStrictEqual(rows.map(r => r.team_id), [a, b, c, d, e]);
  });

  it("тройная ничья по очкам: личные встречи не применяются, решает diff/сеяние", async () => {
    const a = await seedTeam("А", 100);
    const b = await seedTeam("Б", 90);
    const c = await seedTeam("В", 80);
    play(a, b, 110, 80);
    play(b, c, 110, 70);
    play(c, a, 110, 90);
    // в круге из трёх у всех 1 очко — личка нечёткая: порядок по diff,
    // при равном diff (A и B) — по сеянию; A сильнее B → A выше
    const rows = standings.standings(4);
    assert.deepStrictEqual(rows.map(r => r.team_id), [a, b, c]);
  });

  it("незавершённые матчи не попадают в таблицу", async () => {
    const a = await seedTeam("А", 100);
    const b = await seedTeam("Б", 90);
    const { id } = match110.create(a, b, 4);
    game110.create(id);
    db.run(`UPDATE game_110 SET score_1 = 110, score_2 = 80 WHERE match_110_id = ?`, [id]);

    assert.deepStrictEqual(standings.standings(4), []);
  });

  it("фильтр по группе: матчи других групп не учитываются", async () => {
    const a = await seedTeam("А", 100, 1);
    const b = await seedTeam("Б", 90, 1);
    const c = await seedTeam("В", 80, 2);
    const d = await seedTeam("Г", 70, 2);
    play(a, b, 110, 80, 1);
    play(c, d, 110, 70, 2);

    const group1 = standings.standings(4, 1);
    assert.deepStrictEqual(group1.map(r => r.team_id), [a, b]);
    assert.deepStrictEqual(group1.map(r => r.group_id), [1, 1]);
    const group2 = standings.standings(4, 2);
    assert.deepStrictEqual(group2.map(r => r.team_id), [c, d]);
    assert.deepStrictEqual(standings.standings(4, 3), []);
  });
});
