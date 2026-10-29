import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import GameRouter from "../../src/routes/game.ts";
import MatchRouter from "../../src/routes/match.ts";
import UserRouter from "../../src/routes/user.ts";
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
app.use("/api/games", GameRouter);
app.use("/api/matches", MatchRouter);
app.use("/api/users", UserRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/games`;
const matchesBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/matches`;
const usersBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users`;
const db = new Repository().db;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = async (path: string, body?: unknown) => fetch(path, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: body ? JSON.stringify(body) : undefined,
});

// матч двух пар, зарегистрированных на текущий турнир
const seedMatch = async (): Promise<number> => {
  const ids: number[] = [];
  for (const [ln, fn] of [["Тестов", "Алексей"], ["Смирнов", "Борис"], ["Кузнецова", "Вера"], ["Попов", "Григорий"]]) {
    const res = await post(`${usersBase}/create`, {ln, fn, pn: "Отчество", rate: 500, sex: "on", city: 1, bd: "1990-01-01"});
    ids.push(((await res.json()) as { id: number }).id);
  }
  await post(`${usersBase}/register/${ids.join(",")}`);
  const created = await (await post(`${matchesBase}/create`, {
    user_1_id: ids[0], user_2_id: ids[1], user_3_id: ids[2], user_4_id: ids[3],
  })).json() as { id: number };
  return created.id;
};

describe("Game routes", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("POST /create, GET /:id", () => {
    it("должен создать гейм и вернуть его по id", async () => {
      const matchId = await seedMatch();

      const created = await (await post(`${base}/create`, {
        match_id: matchId, lost_1_by: "15", lost_2_by: null, created_at: "2026-01-01 10:00:00",
      })).json() as { id: number };

      const game = await (await fetch(`${base}/${created.id}`)).json() as {
        id: number;
        match_id: number;
        lost_1_by: number;
        lost_2_by: null;
      };

      assert.strictEqual(game.match_id, matchId);
      assert.strictEqual(game.lost_1_by, 15);
      assert.strictEqual(game.lost_2_by, null);
    });
  });

  describe("POST /create (вторая игра)", () => {
    it("должен завершить матч двумя проигранными геймами", async () => {
      const matchId = await seedMatch();

      await post(`${base}/create`, {match_id: matchId, lost_1_by: "15", lost_2_by: null, created_at: "2026-01-01 10:00:00"});
      await post(`${base}/create`, {match_id: matchId, lost_1_by: "17", lost_2_by: null, created_at: "2026-01-01 10:05:00"});

      assert.strictEqual(db.get<{ finished: number }>("SELECT finished FROM match WHERE id = ?", [matchId])!.finished, 1);

      const unfinished = await (await fetch(`${matchesBase}/unfinished`)).json();
      assert.deepStrictEqual(unfinished, []);
    });
  });

  describe("POST /bulk/:match_id (редактирование матча из истории)", () => {
    it("должен применить пачку игр к матчу", async () => {
      const matchId = await seedMatch();
      const g1 = ((await (await post(`${base}/create`, {
        match_id: matchId, lost_1_by: "15", lost_2_by: null, created_at: "2026-01-01 10:00:00",
      })).json()) as { id: number }).id;
      const g2 = ((await (await post(`${base}/create`, {
        match_id: matchId, lost_1_by: "18", lost_2_by: null, created_at: "2026-01-01 10:10:00",
      })).json()) as { id: number }).id;

      const res = await post(`${base}/bulk/${matchId}`, {
        games: [
          {id: g1, lost_1_by: "8", lost_2_by: null},
          {id: g2, lost_1_by: null, lost_2_by: null},
          {lost_1_by: null, lost_2_by: "19"},
        ],
      });
      assert.strictEqual(res.status, 200);

      const games = db.all<{id: number; lost_1_by: number | null; lost_2_by: number | null}>(
          "SELECT id, lost_1_by, lost_2_by FROM game WHERE match_id = ? ORDER BY created_at, id", [matchId]);
      // очищенная g2 удалена, новая создана с новым id
      assert.deepStrictEqual(games.map(g => [g.id, g.lost_1_by, g.lost_2_by]), [
        [g1, 8, null],
        [games[1].id, null, 19],
      ]);
    });
  });
});
