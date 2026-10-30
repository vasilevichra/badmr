import assert from "node:assert/strict";
import { describe, it } from "node:test";

import VkService from "../../src/services/vk.ts";

const vkService = new VkService();

describe("Vk", () => {
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
        const link = await vkService.createChat("Турнир");

        assert.strictEqual(link, "https://vk.me/join/abc");
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
