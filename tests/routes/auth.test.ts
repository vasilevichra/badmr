import assert from "node:assert/strict";
import crypto from "node:crypto";
import Express, { type Express as App } from "express";
import passport from "passport";
import AuthRouter from "../../src/routes/auth.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import Repository from "../../src/repositories/common.ts";
import OAuthService from "../../src/services/oauth.ts";
import { clean } from "../helpers/migration.ts";
import type { AddressInfo } from "node:net";
import { describe, it, beforeEach, after } from "node:test";

const oauthService = new OAuthService();
const db = new Repository().db;

/** Минимальный пользователь; возвращает id. */
const insertUser = (contacts: { email?: string; phone?: string; vkId?: string }): number =>
    db.run(
        `INSERT INTO user (lastname, firstname, sex, city_id, email, phone, vk_id)
         VALUES ('Тестов', 'Тест', 1, 1, ?, ?, ?)`,
        [contacts.email ?? null, contacts.phone ?? null, contacts.vkId ?? null]
    ).id;

const getUser = (id: number): { vk_id: string | null } =>
    db.get<{ vk_id: string | null }>(`SELECT vk_id FROM user WHERE id = ?`, [id])!;

// ——— заглушки VK ID (как в tests/services/oauth.test.ts) ———

const makeKey = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { privateKey, jwk: publicKey.export({ format: "jwk" }) as crypto.webcrypto.JsonWebKey };
};
const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const signIdToken = (key: crypto.KeyObject, payload: object) => {
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  return `${header}.${body}.${b64u(crypto.createSign("RSA-SHA256").update(`${header}.${body}`).sign(key))}`;
};

/** Текущий пользователь теста (req.user) и содержимое его сессии. */
let reqUser: { id: number } | null = null;
let sessionState: Record<string, unknown> = {};

const vkStubs = (opts: { idToken: string; jwk: crypto.webcrypto.JsonWebKey }) => {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    // не-VK запросы (собственный HTTP-клиент теста к серверу) — без заглушки
    if (!u.includes("id.vk.ru") && !u.includes("id.vk.com")) return saved(url, init!);
    const body = u.includes("oauth2/auth")
        ? { access_token: "at-1", id_token: opts.idToken }
        : u.includes("jwks")
            ? { keys: [opts.jwk] }
            : { user: { email: "Roman@Example.com", phone: "+7 (900) 123-45-67" } };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return () => { globalThis.fetch = saved; };
};

// jwk подставляется в момент вызова vkStubs
let jwk: crypto.webcrypto.JsonWebKey;
const vkStubsFactory = (opts: Omit<Parameters<typeof vkStubs>[0], "jwk"> & { jwk?: crypto.webcrypto.JsonWebKey }) =>
    vkStubs({ ...opts, jwk: opts.jwk ?? jwk }) as () => void;

const app: App = Express();
app.use(Express.json());
app.use(passport.initialize());
app.use(promiseMiddleware());
app.use((req, _res, next) => {
  if (reqUser) {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: { id: number } }).user = reqUser;
  } else {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
  }
  (req as unknown as { session: Record<string, unknown> }).session = {
    messages: [], ...sessionState,
    // passport на login регенерирует сессию — в тесте без express-session
    regenerate(cb: (err?: Error) => void) { cb(); },
    save(cb?: (err?: Error) => void) { cb?.(); },
  };
  next();
});
app.use("/api/auth", AuthRouter);
app.use((err: Error, _req: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
  console.error("TEST ERROR HANDLER:", err);
  res.status(500).send("error");
});

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Настраивает env + VK-заглушки под profile с id vkId; возвращает restore.
 *  Сессия заранее содержит oauth {state: 'x', nonce: 'n1', verifier, intent}. */
const stubVk = (vkId: string): (() => void) => {
  process.env.VK_CLIENT_ID = "cid";
  process.env.VK_CLIENT_SECRET = "csecret";
  oauthService.resetJwksCache();
  const key = makeKey();
  jwk = key.jwk;
  return vkStubsFactory({
    idToken: signIdToken(key.privateKey, {
      iss: "https://id.vk.com/", aud: "cid", sub: vkId,
      nonce: "n1",
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  });
};

/** oauth-состояние сессии, совпадающее с query callback (state=x, nonce=n1). */
const givenOauth = (intent: "login" | "bind") => {
  sessionState = { oauth: { state: "x", nonce: "n1", verifier: "v".repeat(43), intent } };
};
const callbackUrl = `${base}/vk/callback?code=c1&state=x`;

describe("Auth routes: VK", () => {
  beforeEach(() => {
    clean();
    reqUser = null;
    givenOauth("login");
  });

  it("без VK_CLIENT_ID GET /vk редиректит на страницу входа", async () => {
    delete process.env.VK_CLIENT_ID;
    delete process.env.VK_CLIENT_SECRET;

    const res = await fetch(`${base}/vk`, { redirect: "manual" });

    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get("location"), "/api/auth/login");
  });

  it("вход по существующей привязке логинит", async () => {
    insertUser({ vkId: "12345" });
    const restore = stubVk("12345");
    try {
      const res = await fetch(callbackUrl, { redirect: "manual" });

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get("location"), "/");
    } finally {
      restore();
      delete process.env.VK_CLIENT_ID;
      delete process.env.VK_CLIENT_SECRET;
    }
  });

  it("автопривязка по email", async () => {
    const id = insertUser({ email: "roman@example.com" });
    const restore = stubVk("12345");
    try {
      const res = await fetch(callbackUrl, { redirect: "manual" });

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get("location"), "/");
      assert.strictEqual(getUser(id).vk_id, "12345");
    } finally {
      restore();
      delete process.env.VK_CLIENT_ID;
      delete process.env.VK_CLIENT_SECRET;
    }
  });

  it("автопривязка по телефону", async () => {
    const id = insertUser({ phone: "+79001234567" });
    const restore = stubVk("12345");
    try {
      const res = await fetch(callbackUrl, { redirect: "manual" });

      assert.strictEqual(res.status, 302);
      assert.strictEqual(getUser(id).vk_id, "12345");
    } finally {
      restore();
      delete process.env.VK_CLIENT_ID;
      delete process.env.VK_CLIENT_SECRET;
    }
  });

  it("расхождение контактов — отказ", async () => {
    const emailId = insertUser({ email: "roman@example.com" });
    const phoneId = insertUser({ phone: "+79001234567" });
    const restore = stubVk("12345");
    try {
      const res = await fetch(callbackUrl, { redirect: "manual" });

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get("location"), "/api/auth/login");
      assert.strictEqual(getUser(emailId).vk_id, null);
      assert.strictEqual(getUser(phoneId).vk_id, null);
    } finally {
      restore();
      delete process.env.VK_CLIENT_ID;
      delete process.env.VK_CLIENT_SECRET;
    }
  });

  it("нет совпадений — отказ с подсказкой", async () => {
    insertUser({});
    const restore = stubVk("12345");
    try {
      const res = await fetch(callbackUrl, { redirect: "manual" });

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get("location"), "/api/auth/login");
    } finally {
      restore();
      delete process.env.VK_CLIENT_ID;
      delete process.env.VK_CLIENT_SECRET;
    }
  });

  it("повторная привязка — отказ", async () => {
    const id = insertUser({ vkId: "999" });
    reqUser = { id };
    givenOauth("bind");
    const restore = stubVk("12345");
    try {
      const res = await fetch(callbackUrl, { redirect: "manual" });

      assert.strictEqual(res.status, 302);
      assert.strictEqual(getUser(id).vk_id, "999");
    } finally {
      restore();
      delete process.env.VK_CLIENT_ID;
      delete process.env.VK_CLIENT_SECRET;
    }
  });

  it("конфликт UNIQUE — человеческое сообщение", async () => {
    const otherId = insertUser({ vkId: "12345" });
    const myId = insertUser({});
    reqUser = { id: myId };
    givenOauth("bind");
    const restore = stubVk("12345");
    try {
      const res = await fetch(callbackUrl, { redirect: "manual" });

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get("location"), "/api/auth/login");
      assert.strictEqual(getUser(myId).vk_id, null);
      assert.strictEqual(getUser(otherId).vk_id, "12345");
    } finally {
      restore();
      delete process.env.VK_CLIENT_ID;
      delete process.env.VK_CLIENT_SECRET;
    }
  });

  it("unbind сбрасывает vk_id", async () => {
    const id = insertUser({ vkId: "12345" });
    reqUser = { id };
    delete process.env.VK_CLIENT_ID;
    delete process.env.VK_CLIENT_SECRET;

    const res = await fetch(`${base}/vk/unbind`, { method: "POST" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(getUser(id).vk_id, null);

    // idempotent-принцип: повторный вызов не ломает состояние
    const res2 = await fetch(`${base}/vk/unbind`, { method: "POST" });
    assert.strictEqual(res2.status, 200);
  });
});
