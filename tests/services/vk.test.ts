import assert from "node:assert/strict";
import { describe, it } from "node:test";

import VkService from "../../src/services/vk.ts";

const vkService = new VkService();

describe("Vk", () => {
  describe("userPhoto", () => {
    it("должен вернуть photo_100 из users.get", async () => {
      process.env.VK_TOKEN = "test-token";
      const saved = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
        assert.match(String(url), /users\.get/);
        const params = new URLSearchParams(String(init?.body));
        assert.strictEqual(params.get("user_ids"), "651677");
        assert.strictEqual(params.get("fields"), "photo_100");
        return new Response(JSON.stringify({ response: [{ id: 651677, photo_100: "https://sun.vk.com/x.jpg" }] }), { headers: { "Content-Type": "application/json" } });
      }) as typeof fetch;
      try {
        assert.strictEqual(await vkService.userPhoto("651677"), "https://sun.vk.com/x.jpg");
      } finally {
        globalThis.fetch = saved;
      }
    });

    it("пустой ответ VK — undefined", async () => {
      process.env.VK_TOKEN = "test-token";
      const saved = globalThis.fetch;
      globalThis.fetch = (async () =>
          new Response(JSON.stringify({ response: [] }), { headers: { "Content-Type": "application/json" } })) as typeof fetch;
      try {
        assert.strictEqual(await vkService.userPhoto("42"), undefined);
      } finally {
        globalThis.fetch = saved;
      }
    });
  });

  describe("createChat", () => {
    it("должен отклониться с понятной ошибкой, если VK_TOKEN не задан", async () => {
      const saved = process.env.VK_TOKEN;
      delete process.env.VK_TOKEN;

      try {
        await assert.rejects(
            () => vkService.createChat("Тест"),
            (err: Error) => {
              assert.match(err.message, /VK_TOKEN/);
              return true;
            },
        );
      } finally {
        if (saved !== undefined) process.env.VK_TOKEN = saved;
      }
    });

    it("должен разобрать chat_id из ответа и запросить ссылку по peer_id", async () => {
      process.env.VK_TOKEN = "test-token";
      const calls: { method: string; body: string }[] = [];
      const savedFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
        const method = String(url).split("/").pop()!;
        calls.push({ method, body: String(init?.body) });
        const response = method === "messages.createChat"
          ? { response: { chat_id: 6, peer_ids: [-219869230] } }
          : { response: { link: "https://vk.me/join/abc" } };
        return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
      }) as typeof fetch;

      try {
        const chat = await vkService.createChat("Турнир");

        assert.deepEqual(chat, { chatId: 6, link: "https://vk.me/join/abc" });
        const invite = calls.find((c) => c.method === "messages.getInviteLink")!;
        assert.ok(invite, "getInviteLink должен быть вызван");
        assert.match(invite.body, /peer_id=2000000006/);
      } finally {
        globalThis.fetch = savedFetch;
        delete process.env.VK_TOKEN;
      }
    });
  });
});
