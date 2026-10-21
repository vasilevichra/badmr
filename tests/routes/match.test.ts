import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import MatchRouter from "../../src/routes/match.ts";
import UserRouter from "../../src/routes/user.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
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
app.use("/api/matches", MatchRouter);
app.use("/api/users", UserRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/matches`;
const usersBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = async (path: string, body?: unknown) => fetch(path, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: body ? JSON.stringify(body) : undefined,
});

// 4 пользователя, зарегистрированные на текущий турнир
const seedUsers = async (): Promise<number[]> => {
  const ids: number[] = [];
  for (const [ln, fn] of [["Тестов", "Алексей"], ["Смирнов", "Борис"], ["Кузнецова", "Вера"], ["Попов", "Григорий"]]) {
    const res = await post(`${usersBase}/create`, {ln, fn, pn: "Отчество", rate: 500, sex: "on", city: 1, bd: "1990-01-01"});
    ids.push(((await res.json()) as { id: number }).id);
  }
  await post(`${usersBase}/register/${ids.join(",")}`);
  return ids;
};

describe("Match routes", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("неавторизованный доступ", () => {
    const anonApp: App = Express();
    anonApp.use(promiseMiddleware());
    anonApp.use("/api/matches", MatchRouter);
    const anonServer = anonApp.listen(0);
    const anonBase = `http://127.0.0.1:${(anonServer.address() as AddressInfo).port}/api/matches`;

    after(async () => {
      await new Promise<void>((resolve) => anonServer.close(() => resolve()));
    });

    it("должен отдать unfinished неавторизованному без редиректа на вход", async () => {
      // /unfinished запрашивается JS со страницы текущего турнира —
      // ensureLoggedIn здесь давал 302 → 404 в консоли браузера
      const res = await fetch(`${anonBase}/unfinished`, {redirect: "manual"});

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await res.json(), []);
    });
  });

  describe("POST /create, GET /unfinished", () => {
    it("должен создать матч и показать его в незавершённых", async () => {
      const ids = await seedUsers();

      const created = await (await post(`${base}/create`, {
        user_1_id: ids[0], user_2_id: ids[1], user_3_id: ids[2], user_4_id: ids[3],
      })).json() as { id: number };

      const unfinished = await (await fetch(`${base}/unfinished`)).json() as { id: number }[];
      assert.strictEqual(unfinished.length, 1);
      assert.strictEqual(unfinished[0].id, created.id);
    });
  });

  describe("GET /:user_id", () => {
    it("должен вернуть пустой список для пользователя без завершённых матчей", async () => {
      const ids = await seedUsers();

      await post(`${base}/create`, {
        user_1_id: ids[0], user_2_id: ids[1], user_3_id: ids[2], user_4_id: ids[3],
      });

      const matches = await (await fetch(`${base}/${ids[0]}`)).json();
      assert.deepStrictEqual(matches, []);
    });
  });

  describe("POST /delete/:id", () => {
    it("должен удалить матч", async () => {
      const ids = await seedUsers();

      const created = await (await post(`${base}/create`, {
        user_1_id: ids[0], user_2_id: ids[1], user_3_id: ids[2], user_4_id: ids[3],
      })).json() as { id: number };

      await post(`${base}/delete/${created.id}`);

      const unfinished = await (await fetch(`${base}/unfinished`)).json();
      assert.deepStrictEqual(unfinished, []);
    });
  });
});
