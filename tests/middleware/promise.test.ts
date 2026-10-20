import assert from "node:assert/strict";
import { describe, after, it } from "node:test";
import Express, { type Express as App } from "express";
import promiseMiddleware from "../../src/middleware/promise.ts";
import type { AddressInfo } from "node:net";

const app: App = Express();
app.use(promiseMiddleware());

// разные формы аргумента res.promise
app.get("/value", (_req, res) => res.promise({ ok: 1 }));
app.get("/promise", (_req, res) => res.promise(Promise.resolve({ ok: 2 })));
app.get("/function", (_req, res) => res.promise(() => ({ ok: 3 })));
app.get("/reject", (_req, res) => res.promise(Promise.reject(new Error("boom"))));
app.get("/throw", (_req, res) => res.promise(() => {
  throw Object.assign(new Error("teapot"), { status: 418 });
}));

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("promise middleware", () => {
  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`);
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      body = JSON.parse(text);
    }
    return { status: res.status, body };
  };

  it("должен отправить обычное значение", async () => {
    assert.deepStrictEqual(await get("/value"), { status: 200, body: { ok: 1 } });
  });

  it("должен отправить результат промиса", async () => {
    assert.deepStrictEqual(await get("/promise"), { status: 200, body: { ok: 2 } });
  });

  it("должен вызвать функцию и отправить её результат", async () => {
    assert.deepStrictEqual(await get("/function"), { status: 200, body: { ok: 3 } });
  });

  it("должен вернуть 500 с текстом ошибки", async () => {
    assert.deepStrictEqual(await get("/reject"), { status: 500, body: { error: "boom" } });
  });

  it("должен вернуть статус из поля error.status", async () => {
    assert.deepStrictEqual(await get("/throw"), { status: 418, body: { error: "teapot" } });
  });
});
