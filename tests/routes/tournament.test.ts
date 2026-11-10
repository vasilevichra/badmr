import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import TournamentRouter from "../../src/routes/tournament.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import Repository from "../../src/repositories/common.ts";
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
app.use("/api/tournaments", TournamentRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tournaments`;
const db = new Repository().db;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Tournament routes", () => {
  beforeEach(async () => {
    await clean();
  });

  it("GET /current/ должен вернуть текущий турнир (4, «Новая Лига»)", async () => {
    const res = await fetch(`${base}/current/`);
    assert.strictEqual(res.status, 200);
    const tournament = await res.json() as { id: number; name: string };
    assert.strictEqual(tournament.id, 4);
    assert.strictEqual(tournament.name, "Новая Лига");
  });

  it("POST /current/:id должен переключить текущий турнир", async () => {
    const res = await fetch(`${base}/current/2`, {method: "POST"});
    assert.strictEqual(res.status, 200);
    const row = db.get<{ current: number }>("SELECT current FROM tournament WHERE id = 2")!;
    assert.strictEqual(row.current, 1);
    assert.strictEqual(db.get<{ c: number }>(
        "SELECT count(*) c FROM tournament WHERE current = 1")!.c, 1);
  });

  it("GET /paid/:id должен вернуть false пока есть неплатившие", async () => {
    // в фикстуре турнира 4 двое неплативших (user 8 и 43)
    const res = await fetch(`${base}/paid/4`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.json(), 0);
  });

  it("GET /paid/:id должен вернуть true когда все заплатили", async () => {
    db.run("UPDATE tournament_user SET paid = 1 WHERE tournament_id = 4");

    const res = await fetch(`${base}/paid/4`);
    assert.strictEqual(await res.json(), 1);
  });

  it("GET /paid/ должен использовать параметр tournament, а не менять global current", async () => {
    const res = await fetch(`${base}/paid/?tournament=4`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.json(), 0);
    // текущий турнир не переключился
    assert.strictEqual(db.get<{ current: number }>(
        "SELECT current FROM tournament WHERE id = 4")!.current, 1);
  });

  it("GET /paid/ должен игнорировать несуществующий tournament и взять current", async () => {
    const res = await fetch(`${base}/paid/?tournament=999`);
    assert.strictEqual(res.status, 200);
    // current (4) — есть неплатившие
    assert.strictEqual(await res.json(), 0);
  });

  it("GET /played/:id должен вернуть false для турнира без завершённых матчей", async () => {
    // volatileSql clean() удаляет все матчи
    const res = await fetch(`${base}/played/4`);
    assert.strictEqual(await res.json(), 0);
  });

  it("GET /played/:id должен вернуть true когда есть завершённый матч", async () => {
    // court_id NOT NULL — берём сидированный корт турнира 4
    const court = db.get<{ id: number }>("SELECT id FROM court WHERE tournament_id = 4 LIMIT 1")!;
    db.run("INSERT INTO match (tournament_id, created_at, user_1_id, user_2_id, user_3_id, user_4_id, court_id, finished) VALUES (4, datetime('now'), 1, 2, 3, 4, ?, 1)", [court.id]);

    const res = await fetch(`${base}/played/4`);
    assert.strictEqual(await res.json(), 1);
  });

  it("POST /pay/:user_id должен проставить оплату (по умолчанию 1)", async () => {
    const res = await fetch(`${base}/pay/8`, {method: "POST"});
    assert.strictEqual(res.status, 200);
    const row = db.get<{ paid: number }>(
        "SELECT paid FROM tournament_user WHERE user_id = 8 AND tournament_id = 4")!;
    assert.strictEqual(row.paid, 1);
  });

  it("POST /pay/:user_id?paid=0 должен снять оплату", async () => {
    const res = await fetch(`${base}/pay/16?paid=0`, {method: "POST"});
    assert.strictEqual(res.status, 200);
    const row = db.get<{ paid: number }>(
        "SELECT paid FROM tournament_user WHERE user_id = 16 AND tournament_id = 4")!;
    assert.strictEqual(row.paid, 0);
  });

  it("POST /pay/:user_id должен трактовать мусор в paid как платёж по умолчанию", async () => {
    const res = await fetch(`${base}/pay/8?paid=abc`, {method: "POST"});
    assert.strictEqual(res.status, 200);
    const row = db.get<{ paid: number }>(
        "SELECT paid FROM tournament_user WHERE user_id = 8 AND tournament_id = 4")!;
    assert.strictEqual(row.paid, 1);
  });

  it("GET /registered/count должен вернуть число регистраций текущего турнира", async () => {
    // в фикстуре турнира 4 — 9 регистраций
    const res = await fetch(`${base}/registered/count`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.json(), 9);
  });

  it("POST /status/:status_id должен сменить статус текущего турнира", async () => {
    const res = await fetch(`${base}/status/1`, {method: "POST"});
    assert.strictEqual(res.status, 200);
    const row = db.get<{ tournament_status_id: number }>(
        "SELECT tournament_status_id FROM tournament WHERE id = 4")!;
    assert.strictEqual(row.tournament_status_id, 1);
  });

  it("GET /:id должен вернуть турнир по id", async () => {
    const res = await fetch(`${base}/2`);
    assert.strictEqual(res.status, 200);
    const tournament = await res.json() as { id: number; name: string };
    assert.strictEqual(tournament.id, 2);
    assert.strictEqual(tournament.name, "110-1");
  });

  it("GET / должен вернуть список турниров", async () => {
    const res = await fetch(`${base}/`);
    assert.strictEqual(res.status, 200);
    const tournaments = await res.json() as { id: number }[];
    assert.strictEqual(tournaments.length, 4);
  });

  it("POST /create должен отклонить норму матчей не больше калибровочной серии", async () => {
    const res = await fetch(`${base}/create`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        user: 1, club: 1, gym: 1, type: 1, name: "Плохой",
        reg: "2026-01-01 10:00", start: "2026-01-02 10:00", end: "2026-01-02 18:00",
        cap: 16, courts: 2, rmin: "", rmax: "", rules: "", cur: 0,
        matches: 3, wins: 2, game_point: "", max_point: "", fee: 0,
        calibration_matches: 5, calibration_days: 14,
      }),
    });
    assert.strictEqual(res.status, 500);
    const body = await res.json() as { error: string };
    assert.match(body.error, /Норма матчей/);
    // полусозданного турнира нет
    assert.strictEqual(db.get<{ c: number }>(
        "SELECT count(*) c FROM tournament WHERE name = 'Плохой'")!.c, 0);
  });

  it("POST /create должен создать турнир с настройками при matches > calibration", async () => {
    const res = await fetch(`${base}/create`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        user: 1, club: 1, gym: 1, type: 1, name: "Роут-турнир",
        reg: "2026-01-01 10:00", start: "2026-01-02 10:00", end: "2026-01-02 18:00",
        cap: 16, courts: 2, rmin: "", rmax: "", rules: "", cur: 0,
        matches: 6, wins: 2, game_point: "", max_point: "", fee: 0,
        calibration_matches: 5, calibration_days: 14,
      }),
    });
    assert.strictEqual(res.status, 200);
    // сервис create возвращает голый id
    const created = await res.json() as number;
    const row = db.get<{ name: string; current: number }>(
        "SELECT name, current FROM tournament WHERE id = ?", [created])!;
    assert.strictEqual(row.name, "Роут-турнир");
    assert.strictEqual(row.current, 0);
    // настройки записаны
    const matches = db.get<{ v: string }>(
        "SELECT s.value v FROM tournament_settings s JOIN defaults d ON d.id = s.defaults_id WHERE s.tournament_id = ? AND d.name = 'matches'",
        [created])!;
    assert.strictEqual(matches.v, "6");
  });
});
