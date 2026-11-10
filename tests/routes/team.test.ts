import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import TeamRouter from "../../src/routes/team.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import Repository from "../../src/repositories/common.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";
import type { AddressInfo } from "node:net";

const app: App = Express();
app.use(Express.json());
app.use(promiseMiddleware());
app.use((req, _res, next) => {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: number } }).user = { id: 1 };
  next();
});
app.use("/api/teams", TeamRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/teams`;
const db = new Repository().db;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();

/** Команда в текущем турнире (4) с парой игроков; team_color_id уникален,
 *  т.к. clean() снимает только фикстурные команды, а UNIQUE покрывает
 *  (tournament_id, group_id, team_color_id) и (tournament_id, city_id, name). */
let seedSeq = 950;
const seedTeam = async (sexes: number[]) => {
  const team = teamService.create(4, 5, `Роут ${++seedSeq}`, 1, seedSeq)!;
  const teamUserIds: number[] = [];
  for (const [i, sex] of sexes.entries()) {
    const user = await userService.create(`Игрок${i}`, "Роут", "", 500, sex, 1, "1990-01-01");
    teamUserIds.push(teamUserService.create(team.id, user.id, 5)!.id);
  }
  return { team: team.id, teamUserIds };
};

describe("Team routes", () => {
  beforeEach(async () => {
    await clean();
  });

  it("GET /colors/select должен вернуть список цветов", async () => {
    const res = await fetch(`${base}/colors/select`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { results: { id: number }[] };
    assert.strictEqual(body.results.length, 12);
  });

  it("GET /:id/roster должен вернуть состав команды", async () => {
    const { team } = await seedTeam([1, 0]);

    const res = await fetch(`${base}/${team}/roster`);
    assert.strictEqual(res.status, 200);
    const roster = await res.json() as { sex: number }[];
    assert.strictEqual(roster.length, 2);
    assert.deepEqual(roster.map(p => p.sex).sort(), [0, 1]);
  });

  it("GET /:id/order/:position_number должен вернуть кандидатов слота по полу", async () => {
    const { team } = await seedTeam([1, 1, 0]);

    const res = await fetch(`${base}/${team}/order/1`); // ms1 — мужской слот
    assert.strictEqual(res.status, 200);
    const candidates = await res.json() as { sex: number }[];
    assert.strictEqual(candidates.length, 2);
    assert.ok(candidates.every(p => p.sex === 1));
  });

  it("GET /:team_id/position/:position_number должен вернуть игрока слота", async () => {
    const { team, teamUserIds } = await seedTeam([1]);

    await fetch(`${base}/${team}/order/1?team_user_id=${teamUserIds[0]}`, {method: "POST"});

    const res = await fetch(`${base}/${team}/position/1`);
    assert.strictEqual(res.status, 200);
    const player = await res.json() as { id: number } | undefined;
    assert.strictEqual(player?.id, teamUserIds[0]);
  });

  it("GET /:team_id/position/:position_number должен вернуть пустой ответ для пустого слота", async () => {
    const { team } = await seedTeam([1]);

    const res = await fetch(`${base}/${team}/position/1`);
    assert.strictEqual(res.status, 200);
    const body = await res.text();
    assert.strictEqual(body, "");
  });

  it("POST /:team_id/order/:position_number должен записать слот", async () => {
    const { team, teamUserIds } = await seedTeam([1]);

    const res = await fetch(`${base}/${team}/order/1?team_user_id=${teamUserIds[0]}`, {method: "POST"});
    assert.strictEqual(res.status, 200);

    const row = db.get<{ ms1: number }>("SELECT ms1 FROM team_order_110 WHERE team_id = ?", [team])!;
    assert.strictEqual(row.ms1, teamUserIds[0]);
  });

  it("POST /:team_id/name должен переименовать команду", async () => {
    const { team } = await seedTeam([1]);

    const res = await fetch(`${base}/${team}/name?value=${encodeURIComponent("Новое имя")}`, {method: "POST"});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(db.get<{ name: string }>("SELECT name FROM team WHERE id = ?", [team])!.name, "Новое имя");
  });

  it("POST /:team_id/city/:city_id должен сменить город", async () => {
    const { team } = await seedTeam([1]);

    const res = await fetch(`${base}/${team}/city/2`, {method: "POST"});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(db.get<{ city_id: number }>("SELECT city_id FROM team WHERE id = ?", [team])!.city_id, 2);
  });

  it("POST /create должен создать команду", async () => {
    const res = await fetch(`${base}/create`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({tournament_id: 4, group_id: 5, name: "Создана роутом", city_id: 1, team_color_id: 990}),
    });
    assert.strictEqual(res.status, 200);
    const team = await res.json() as { id: number };
    const row = db.get<{ name: string }>("SELECT name FROM team WHERE id = ?", [team.id])!;
    assert.strictEqual(row.name, "Создана роутом");
  });

  it("POST /users/create должен добавить игрока в команду", async () => {
    const { team } = await seedTeam([]);
    const user = await userService.create("Новый", "Игрок", "", 500, 1, 1, "1990-01-01");

    const res = await fetch(`${base}/users/create`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({team_id: team, user_id: user.id, group_id: 5}),
    });
    assert.strictEqual(res.status, 200);
    const row = db.get<{ team_id: number }>(
        "SELECT team_id FROM team_user WHERE user_id = ?", [user.id])!;
    assert.strictEqual(row.team_id, team);
  });

  it("POST /:team_id/users/:user_id должен перенести игрока в другую группу", async () => {
    const { team } = await seedTeam([]);
    const user = await userService.create("Перенос", "Игрок", "", 500, 1, 1, "1990-01-01");
    teamUserService.create(team, user.id, 5);

    const res = await fetch(`${base}/${team}/users/${user.id}?group_id=7`, {method: "POST"});
    assert.strictEqual(res.status, 200);
    const row = db.get<{ group_id: number }>(
        "SELECT group_id FROM team_user WHERE user_id = ?", [user.id])!;
    assert.strictEqual(row.group_id, 7);
  });
});
