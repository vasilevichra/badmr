import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import SettingsRouter from "../../src/routes/settings.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";
import type { AddressInfo } from "node:net";

const app: App = Express();
app.use(Express.json());
app.use(promiseMiddleware());
app.use("/api/settings", SettingsRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/settings`;
const db = new Repository().db;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (name: string, value: string) => fetch(`${base}/${name}`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({value: value})
});

const tournamentSettingsRows = () => db.all(
    `SELECT s.value, s.tournament_id
     FROM tournament_settings s
              JOIN defaults d ON d.id = s.defaults_id
     WHERE d.name = 'wins'`
);

describe("Settings API", () => {
  beforeEach(async () => {
    await clean();
  });

  it("должен вернуть список настроек", async () => {
    const res = await fetch(base);
    const rows = await res.json() as { name: string; value: unknown; description: string }[];

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(rows));
    assert.ok(rows.some((r) => r.name === "wins" && r.description));
  });

  it("должен сохранить значение настройки в tournament_settings текущего турнира", async () => {
    // в тестовой БД текущий турнир — id 4; для wins значение не переопределено
    const res = await post("wins", "3");

    assert.strictEqual(res.status, 200);

    const rows = tournamentSettingsRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].value, "3");
    assert.strictEqual(rows[0].tournament_id, 4);

    // настройка читается уже из tournament_settings
    const get = await fetch(`${base}/wins`);
    assert.strictEqual(await get.text(), "3");
  });

  it("должен обновить значение настройки без дублирования строк", async () => {
    await post("wins", "3");
    await post("wins", "1");

    const rows = tournamentSettingsRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].value, "1");
  });

  // ограничения значений из схемы defaults повторяются на сервере:
  // в tournament_settings констрейнтов нет, иначе POST записал бы мусор
  it("должен отклонить значение ниже нижней границы", async () => {
    const res = await post("wins", "0");

    assert.strictEqual(res.status, 400);
    assert.match(await res.text() as string, /wins должен быть не меньше 1/);
    assert.strictEqual(tournamentSettingsRows().length, 0);
  });

  it("должен отклонить нецелочисленное значение", async () => {
    const res = await post("delta", "abc");

    assert.strictEqual(res.status, 400);
    assert.strictEqual(tournamentSettingsRows().length, 0);
  });

  it("должен отклонить нередактируемую настройку type", async () => {
    const res = await post("type", "2");

    assert.strictEqual(res.status, 400);
    assert.match(await res.text() as string, /нередактируемая/);
    assert.strictEqual(tournamentSettingsRows().length, 0);
  });

  it("должен принять boolean у delta_auto и отклонить прочие значения", async () => {
    assert.strictEqual((await post("delta_auto", "1")).status, 200);
    assert.strictEqual((await post("delta_auto", "0")).status, 200);
    assert.strictEqual((await post("delta_auto", "2")).status, 400);
  });

  it("должен отклонить перекрёстное ограничение", async () => {
    // max_point (30) должен быть больше game_point (21)
    const res = await post("game_point", "30");

    assert.strictEqual(res.status, 400);
    assert.match(await res.text() as string, /game_point должен быть меньше max_point/);
  });

  it("должен принять валидные значения", async () => {
    assert.strictEqual((await post("wins", "3")).status, 200);
    assert.strictEqual((await post("max_point", "40")).status, 200);
    assert.strictEqual((await post("rematch_window", "5")).status, 200);
    assert.strictEqual((await post("delta_auto_window", "30")).status, 200);
  });
});
