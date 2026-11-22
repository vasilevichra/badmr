import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it, beforeEach } from "node:test";
import OAuthService from "../../src/services/oauth.ts";
import UserRepository from "../../src/repositories/user.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";

const oauth = new OAuthService();
const userRepository = new UserRepository();
const userService = new UserService();

/** Минимальный пользователь: обязательны lastname/firstname/sex/city_id. */
const insertUser = (contacts: { email?: string; phone?: string; vkId?: string }): number => {
  const result = userRepository.db.run(
      `INSERT INTO user (lastname, firstname, sex, city_id, email, phone, vk_id)
       VALUES ('Тестов', 'Тест', 1, 1, ?, ?, ?)`,
      [contacts.email ?? null, contacts.phone ?? null, contacts.vkId ?? null]
  );
  return result.id;
};

/** RSA-пара и JWK для заглушки JWKS VK. */
function makeKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as crypto.JsonWebKey;
  return { privateKey, jwk };
}

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

/** id_token RS256, подписанный переданным ключом. */
function signIdToken(key: crypto.KeyObjectLike | crypto.PrivateKeyInput, payload: object) {
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createSign("RSA-SHA256").update(`${header}.${body}`).sign(key as crypto.PrivateKey);
  return `${header}.${body}.${b64u(sig)}`;
}

/** Подмена fetch: get_token / jwks / user_info как у VK ID. */
function stubFetch(opts: { keys: object[]; idToken: string }) {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    let body: object;
    if (u.includes("get_token")) body = { access_token: "at-1", id_token: opts.idToken };
    else if (u.includes("jwks")) body = { keys: opts.keys };
    else body = { user: { email: "Roman@Example.com", phone: "+7 (900) 123-45-67" } };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return () => { globalThis.fetch = saved; };
}

describe("OAuth", () => {
  describe("normalizeEmail", () => {
    it("приводит к нижнему регистру и тримит", () => {
      assert.strictEqual(oauth.normalizeEmail("  Roman@Example.COM "), "roman@example.com");
    });
    it("пустое и мусор — null", () => {
      assert.strictEqual(oauth.normalizeEmail(""), null);
      assert.strictEqual(oauth.normalizeEmail(null), null);
      assert.strictEqual(oauth.normalizeEmail("не-почта"), null);
    });
  });
  describe("normalizePhone", () => {
    it("вычищает форматирование и приводит 8 к +7", () => {
      assert.strictEqual(oauth.normalizePhone("+7 (900) 123-45-67"), "+79001234567");
      assert.strictEqual(oauth.normalizePhone("89001234567"), "+79001234567");
      assert.strictEqual(oauth.normalizePhone("79001234567"), "+79001234567");
    });
    it("невалидный номер — null", () => {
      assert.strictEqual(oauth.normalizePhone("+7952"), null);
      assert.strictEqual(oauth.normalizePhone(null), null);
      assert.strictEqual(oauth.normalizePhone("12345"), null);
    });
  });

  describe("startAuth / handleCallback", () => {
    it("startAuth кладёт state/nonce/verifier в сессию и возвращает URL с code_challenge", () => {
      const session: Record<string, unknown> = {};
      const url = new URL(oauth.startAuth(session, "login"));

      assert.strictEqual(url.origin + url.pathname, "https://id.vk.com/authorize");
      assert.strictEqual(url.searchParams.get("response_type"), "code");
      assert.strictEqual(url.searchParams.get("scope"), "email phone");
      assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");
      const session_ = session.oauth as { state: string; nonce: string; verifier: string; intent: string };
      assert.strictEqual(url.searchParams.get("state"), session_.state);
      assert.strictEqual(url.searchParams.get("nonce"), session_.nonce);
      assert.ok(session_.verifier.length >= 43 && session_.verifier.length <= 128);
      assert.match(session_.verifier, /^[A-Za-z0-9\-._~]+$/);
      assert.strictEqual(session_.intent, "login");
      const challenge = crypto.createHash("sha256").update(session_.verifier).digest("base64url");
      assert.strictEqual(url.searchParams.get("code_challenge"), challenge);
    });

    it("handleCallback возвращает профиль с нормализованными контактами", async () => {
      const key = makeKey();
      process.env.VK_CLIENT_ID = "cid";
      process.env.VK_CLIENT_SECRET = "csecret";
      oauth.resetJwksCache();
      const session: Record<string, unknown> = {};
      oauth.startAuth(session, "login");
      const restore = stubFetch({
        keys: [key.jwk],
        idToken: signIdToken(key.privateKey, {
          iss: "https://id.vk.com/", aud: "cid", sub: "12345",
          nonce: (session.oauth as { nonce: string }).nonce, exp: Math.floor(Date.now() / 1000) + 300,
        }),
      });
      try {
        const profile = await oauth.handleCallback({
          query: { code: "c1", state: (session.oauth as { state: string }).state },
          session,
        });
        assert.deepStrictEqual(profile, { vkId: "12345", email: "roman@example.com", phone: "+79001234567" });
      } finally {
        restore();
        delete process.env.VK_CLIENT_ID;
        delete process.env.VK_CLIENT_SECRET;
      }
    });

    it("handleCallback отклоняет чужой state", async () => {
      const key = makeKey();
      process.env.VK_CLIENT_ID = "cid";
      process.env.VK_CLIENT_SECRET = "csecret";
      oauth.resetJwksCache();
      const session: Record<string, unknown> = {};
      oauth.startAuth(session, "login");
      const restore = stubFetch({
        keys: [key.jwk],
        idToken: signIdToken(key.privateKey, { iss: "https://id.vk.com/", aud: "cid", sub: "1", exp: 0 }),
      });
      try {
        await assert.rejects(
          () => oauth.handleCallback({ query: { code: "c1", state: "злоумышленник" }, session }),
          (err: Error) => /state/.test(err.message),
        );
      } finally {
        restore();
        delete process.env.VK_CLIENT_ID;
        delete process.env.VK_CLIENT_SECRET;
      }
    });

    it("handleCallback отклоняет подписанный чужим ключом id_token", async () => {
      const key = makeKey();
      const other = makeKey();
      process.env.VK_CLIENT_ID = "cid";
      process.env.VK_CLIENT_SECRET = "csecret";
      oauth.resetJwksCache();
      const session: Record<string, unknown> = {};
      oauth.startAuth(session, "login");
      const restore = stubFetch({
        keys: [key.jwk],
        idToken: signIdToken(other.privateKey, {
          iss: "https://id.vk.com/", aud: "cid", sub: "12345",
          nonce: (session.oauth as { nonce: string }).nonce, exp: Math.floor(Date.now() / 1000) + 300,
        }),
      });
      try {
        await assert.rejects(
          () => oauth.handleCallback({
            query: { code: "c1", state: (session.oauth as { state: string }).state },
            session,
          }),
          (err: Error) => /подпис|токен/i.test(err.message),
        );
      } finally {
        restore();
        delete process.env.VK_CLIENT_ID;
        delete process.env.VK_CLIENT_SECRET;
      }
    });
  });

  describe("поиск по vk_id и контактам", () => {
    beforeEach(() => {
      clean();
    });

    it("getByVkId находит по привязке, по отсутствующей — undefined", () => {
      const id = insertUser({ vkId: "12345" });

      assert.deepStrictEqual(userService.getByVkId("12345"), { id });
      assert.strictEqual(userService.getByVkId("999"), undefined);
    });

    it("getByContacts находит по email без учёта регистра", () => {
      const id = insertUser({ email: "roman@example.com" });

      assert.deepStrictEqual(userService.getContactsMatches("ROMAN@example.com", null), [{ id }]);
    });

    it("getByContacts находит по телефону", () => {
      const id = insertUser({ phone: "+79001234567" });

      assert.deepStrictEqual(userService.getContactsMatches(null, "+79001234567"), [{ id }]);
    });

    it("email одного и телефон другого — два разных id (расхождение)", () => {
      const emailId = insertUser({ email: "roman@example.com" });
      const phoneId = insertUser({ phone: "+79001234567" });

      const matches = userService.getContactsMatches("roman@example.com", "+79001234567");
      assert.strictEqual(matches.length, 2);
      const ids = matches.map((m) => m.id).sort((a, b) => a - b);
      assert.deepStrictEqual(ids, [emailId, phoneId].sort((a, b) => a - b));
    });

    it("оба контакта null — пустой список", () => {
      insertUser({ email: "roman@example.com" });

      assert.deepStrictEqual(userService.getContactsMatches(null, null), []);
    });
  });
});
