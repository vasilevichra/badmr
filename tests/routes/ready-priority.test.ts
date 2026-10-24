import assert from "node:assert/strict";
import { describe, after, it } from "node:test";
import Express, { type Express as App } from "express";
import ReadyPriorityRouter from "../../src/routes/ready-priority.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import type { AddressInfo } from "node:net";

const app: App = Express();
app.use(Express.json());
app.use(promiseMiddleware());
app.use("/api/ready-priorities", ReadyPriorityRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ready-priorities`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("ReadyPriority API", () => {
  it("должен вернуть список полей сортировки", async () => {
    const res = await fetch(`${base}/select/`);
    const {results} = await res.json() as { results: { id: number; text: string }[] };

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(results, [
      { id: 1, text: "played" },
      { id: 2, text: "matches" },
      { id: 3, text: "diff" },
      { id: 4, text: "friends" },
      { id: 5, text: "rematch" },
      { id: 6, text: "balance" },
    ]);
  });
});
