import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import TgBotService from "../../src/services/tg-bot.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";

const userService = new UserService();

interface Sent {
  chatId: number;
  text: string;
}

/** Подмена fetch: getMe / getUpdates / sendMessage как у Bot API. */
function stubFetch(opts: { username?: string; updates?: { update_id: number; message?: { chat: { id: number }; text?: string } }[] } = {}) {
  const sent: Sent[] = [];
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    let body: object;
    if (u.includes("/getMe")) body = { ok: true, result: { username: opts.username ?? "badmr_bot", id: 1 } };
    else if (u.includes("/getUpdates")) body = { ok: true, result: opts.updates ?? [] };
    else if (u.includes("/sendMessage")) {
      const params = new URL(u).searchParams;
      sent.push({ chatId: Number(params.get("chat_id")), text: String(params.get("text")) });
      body = { ok: true, result: { message_id: 1 } };
    } else body = { ok: false };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return () => { globalThis.fetch = saved; return sent; };
}

const insertUser = (tgId: string | null): number => {
  const result = userService.user.db.run(
      `INSERT INTO user (lastname, firstname, sex, city_id, tg_id) VALUES ('Тестов', 'Тест', 1, 1, ?)`,
      [tgId],
  );
  return result.id;
};

const tgOf = (id: number): string | null =>
    userService.user.db.get<{ v: string | null }>(`SELECT tg_id AS v FROM user WHERE id = ?`, [id])!.v;

/** update сообщения /start с кодом от чата chatId. */
const startUpdate = (updateId: number, chatId: number, text: string) =>
    ({ update_id: updateId, message: { chat: { id: chatId }, text } });

describe("TgBot", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("startBind", () => {
    it("выдаёт одноразовый код и ссылку на бота", async () => {
      const restore = stubFetch();
      try {
        const bot = new TgBotService();
        const { code, botLink } = await bot.startBind(1);
        assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
        assert.strictEqual(botLink, `https://t.me/badmr_bot?start=${code}`);
      } finally {
        restore();
      }
    });
  });

  describe("pollOnce", () => {
    it("привязывает числовой id по /start CODE и отвечает пользователю", async () => {
      const id = insertUser(null);
      const bot = new TgBotService();
      const restore = stubFetch();
      const { code } = await bot.startBind(id);
      restore();
      const restore2 = stubFetch({ updates: [startUpdate(555, 777, `/start ${code}`)] });
      try {
        const offset = await bot.pollOnce();
        assert.strictEqual(offset, 556);
        assert.strictEqual(tgOf(id), "777");
        const sent = restore2();
        assert.ok(sent.some((s) => s.chatId === 777 && /привязан/i.test(s.text)));
      } finally {
        restore2();
      }
    });

    it("код одноразовый: повторный /start с тем же кодом состояние не меняет", async () => {
      const id = insertUser(null);
      const bot = new TgBotService();
      const restore = stubFetch();
      const { code } = await bot.startBind(id);
      restore();
      const restore2 = stubFetch({ updates: [startUpdate(1, 777, `/start ${code}`)] });
      await bot.pollOnce();
      restore2();
      const restore3 = stubFetch({ updates: [startUpdate(2, 777, `/start ${code}`)] });
      try {
        await bot.pollOnce();
        assert.strictEqual(tgOf(id), "777");
        const sent = restore3();
        assert.ok(sent.some((s) => /не найден|устарел/i.test(s.text)));
      } finally {
        restore3();
      }
    });

    it("tg_id, занятый другим аккаунтом, не перезаписывается", async () => {
      insertUser("777");
      const id = insertUser(null);
      const bot = new TgBotService();
      const restore = stubFetch();
      const { code } = await bot.startBind(id);
      restore();
      const restore2 = stubFetch({ updates: [startUpdate(1, 777, `/start ${code}`)] });
      try {
        await bot.pollOnce();
        assert.strictEqual(tgOf(id), null);
        const sent = restore2();
        assert.ok(sent.some((s) => /другому/i.test(s.text)));
      } finally {
        restore2();
      }
    });

    it("просроченный код — отказ", async () => {
      const id = insertUser(null);
      const bot = new TgBotService(0);
      const restore = stubFetch();
      const { code } = await bot.startBind(id);
      restore();
      const restore2 = stubFetch({ updates: [startUpdate(1, 777, `/start ${code}`)] });
      try {
        await bot.pollOnce();
        assert.strictEqual(tgOf(id), null);
        const sent = restore2();
        assert.ok(sent.some((s) => /не найден|устарел/i.test(s.text)));
      } finally {
        restore2();
      }
    });

    it("/start без кода — подсказка, привязки нет", async () => {
      const id = insertUser(null);
      const bot = new TgBotService();
      const restore2 = stubFetch({ updates: [startUpdate(1, 777, "/start")] });
      try {
        await bot.pollOnce();
        assert.strictEqual(tgOf(id), null);
        const sent = restore2();
        assert.ok(sent.some((s) => /код/i.test(s.text)));
      } finally {
        restore2();
      }
    });
  });
});
