import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import CourtRouter from "../../src/routes/court.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import { clean } from "../helpers/migration.ts";
import type { AddressInfo } from "node:net";

interface CourtRow {
  id: number;
  number: number;
  available: number;
}

interface CourtFullRow extends CourtRow {
  tournament_id: number;
}

const app: App = Express();
app.use(Express.json());
app.use(promiseMiddleware());
app.use((req, _res, next) => {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: number } }).user = { id: 1 };
  next();
});
app.use("/api/courts", CourtRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/courts`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Court routes", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("GET /", () => {
    it("должен вернуть все корты", async () => {
      const res = await fetch(base);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual<CourtRow[]>(await res.json(), [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
      ]);
    });
  });

  describe("GET /:id", () => {
    it("должен вернуть корт по id", async () => {
      const res = await fetch(`${base}/11`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual<CourtFullRow>(await res.json(), {
        id: 11,
        tournament_id: 4,
        number: 1,
        available: 1,
      });
    });

    it("должен вернуть пустой ответ для несуществующего корта", async () => {
      const res = await fetch(`${base}/99`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), "");
    });
  });

  describe("POST /create", () => {
    it("должен создать корт", async () => {
      const res = await fetch(`${base}/create`, { method: "POST" });
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await res.json(), { id: 14 });

      const all: CourtRow[] = await (await fetch(base)).json();
      assert.deepStrictEqual<CourtRow[]>(all, [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
        { id: 14, number: 4, available: 1 },
      ]);
    });
  });

  describe("POST /enable", () => {
    it("должен сделать все корты доступными", async () => {
      await fetch(`${base}/disable`, { method: "POST" });

      const res = await fetch(`${base}/enable`, { method: "POST" });
      assert.strictEqual(res.status, 200);

      const all: CourtRow[] = await (await fetch(base)).json();
      assert.deepStrictEqual<CourtRow[]>(all, [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
      ]);
    });
  });

  describe("POST /enable/:number", () => {
    it("должен сделать корт доступным", async () => {
      await fetch(`${base}/disable`, { method: "POST" });

      const res = await fetch(`${base}/enable/1`, { method: "POST" });
      assert.strictEqual(res.status, 200);

      const court: CourtFullRow = await (await fetch(`${base}/11`)).json();
      assert.strictEqual(court.available, 1);
    });
  });

  describe("POST /disable", () => {
    it("должен сделать все корты недоступными", async () => {
      const res = await fetch(`${base}/disable`, { method: "POST" });
      assert.strictEqual(res.status, 200);

      const all: CourtRow[] = await (await fetch(base)).json();
      assert.deepStrictEqual<CourtRow[]>(all, [
        { id: 11, number: 1, available: 0 },
        { id: 12, number: 2, available: 0 },
        { id: 13, number: 3, available: 0 },
      ]);
    });
  });

  describe("POST /disable/:number", () => {
    it("должен сделать корт недоступным", async () => {
      const res = await fetch(`${base}/disable/1`, { method: "POST" });
      assert.strictEqual(res.status, 200);

      const court: CourtFullRow = await (await fetch(`${base}/11`)).json();
      assert.strictEqual(court.available, 0);
    });
  });

  describe("POST /delete/:id", () => {
    it("должен удалить корт", async () => {
      await fetch(`${base}/create`, { method: "POST" });

      const res = await fetch(`${base}/delete/14`, { method: "POST" });
      assert.strictEqual(res.status, 200);

      const all: CourtRow[] = await (await fetch(base)).json();
      assert.deepStrictEqual<CourtRow[]>(all, [
        { id: 11, number: 1, available: 1 },
        { id: 12, number: 2, available: 1 },
        { id: 13, number: 3, available: 1 },
      ]);
    });
  });
});
