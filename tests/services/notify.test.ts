import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import crypto from "node:crypto";
import "./../helpers/env.ts";
import NotifyService from "../../src/services/notify.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";

const userService = new UserService();
const db = userService.user.db;
const notify = new NotifyService();

interface TgSend { kind: "tg"; chatId: string; text: string }
interface VkSend { kind: "vk"; userId?: string; chatId?: string; text: string }
type Send = TgSend | VkSend;

/** Подмена fetch: sendMessage Bot API и messages.send VK API.
 *  Возвращает функцию: восстанавливает fetch и возвращает список отправок. */
function stubFetch(): () => Send[] {
  const sent: Send[] = [];
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("api.vk.com/method/messages.send")) {
      const params = new URLSearchParams(String(init?.body));
      sent.push({
        kind: "vk",
        userId: params.get("user_id") ?? undefined,
        chatId: params.get("chat_id") ?? undefined,
        text: String(params.get("message")),
      });
      return new Response(JSON.stringify({ response: { message_id: 1 } }), { headers: { "Content-Type": "application/json" } });
    }
    if (u.includes("/sendMessage")) {
      const params = new URL(u).searchParams;
      sent.push({ kind: "tg", chatId: String(params.get("chat_id")), text: String(params.get("text")) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = saved;
    return sent;
  };
}

const insertUser = (tgId: string | null, vkId: string | null): number => db.run(
    `INSERT INTO user (lastname, firstname, sex, city_id, tg_id, vk_id)
     VALUES ('Игроков', 'Игрок', 1, 1, ?, ?)`,
    [tgId, vkId],
).id;

/** Турнир 1: VK-чат с известным chat_id (сид фикстур). */
const prepareTournament = (vkChatId: number | null = 42) => {
  db.run(`UPDATE tournament SET chat = 'https://vk.me/join/abc', vk_chat_id = ? WHERE id = 1`, [vkChatId]);
};

const createMatch = (players: number[]): number => db.run(
    `INSERT INTO match (tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id)
     VALUES (1, ?, ?, ?, ?, 1)`,
    players,
).id;

const createTeams = (team1: number[], team2: number[]): [number, number] => {
  const mk = (users: number[]): number => {
    const teamId = db.run(
        `INSERT INTO team (tournament_id, group_id, name, city_id, team_color_id)
         VALUES (1, 1, ?, 1, (SELECT coalesce(MAX(team_color_id), 0) + 1 FROM team WHERE tournament_id = 1 AND group_id = 1))`,
        [`Т-${crypto.randomInt(2 ** 20)}`],
    ).id;
    for (const u of users) {
      db.run(`INSERT INTO team_user (team_id, user_id, group_id) VALUES (?, ?, 1)`, [teamId, u]);
    }
    return teamId;
  };
  return [mk(team1), mk(team2)];
};

describe("Notify", () => {
  beforeEach(async () => {
    await clean();
    process.env.VK_TOKEN = "test-token";
    process.env.TG_BOT_TOKEN ??= "test-token";
    // clean() не трогает chat турнира — сбрасываем явно
    db.run(`UPDATE tournament SET chat = NULL, vk_chat_id = NULL`);
  });

  describe("вызов на матч", () => {
    it("шлёт в TG каждому с tg_id, в VK — каждому с vk_id и в чат турнира", async () => {
      prepareTournament();
      const u1 = insertUser("111", "900");
      const u2 = insertUser(null, "901");
      const u3 = insertUser("222", null);
      const u4 = insertUser(null, null);
      const matchId = createMatch([u1, u2, u3, u4]);
      const restore = stubFetch();
      try {
        await notify.matchCreated(matchId);
        const sent = restore();
        const tg = sent.filter((s) => s.kind === "tg") as TgSend[];
        const vkUser = sent.filter((s) => s.kind === "vk" && s.userId) as VkSend[];
        const vkChat = sent.filter((s) => s.kind === "vk" && s.chatId) as VkSend[];
        assert.deepEqual(tg.map((s) => s.chatId).sort(), ["111", "222"]);
        assert.deepEqual(vkUser.map((s) => s.userId).sort(), ["900", "901"]);
        assert.equal(vkChat.length, 1);
        assert.equal(vkChat[0].chatId, "42");
        const text = vkChat[0].text;
        assert.match(text, /Рейтинг/);       // название турнира
        assert.match(text, /корт 1/);        // номер корта
        assert.match(text, /Игроков/);       // участники
      } finally {
        restore();
      }
    });

    it("у игроков без tg_id/vk_id и без чата — только доступные каналы, без падений", async () => {
      const u = insertUser(null, null);
      const matchId = createMatch([u, u, u, u]);
      const restore = stubFetch();
      try {
        await notify.matchCreated(matchId);
        const sent = restore();
        assert.equal(sent.length, 0);
      } finally {
        restore();
      }
    });
  });

  describe("результат матча", () => {
    it("счёт по геймам и победитель — в тот же набор каналов", async () => {
      prepareTournament();
      const u1 = insertUser("111", null);
      const u2 = insertUser("112", null);
      const u3 = insertUser(null, "900");
      const u4 = insertUser(null, null);
      const matchId = createMatch([u1, u2, u3, u4]);
      // команда 1 побеждает 2:1
      const games: [number, number][] = [[21, 15], [18, 21], [21, 19]];
      for (const [s1, s2] of games) {
        db.run(
            `INSERT INTO game (match_id, current, score_1, score_2, lost_1_by, lost_2_by)
             VALUES (?, 0, ?, ?, NULL, NULL)`,
            [matchId, s1, s2],
        );
      }
      db.run(`UPDATE match SET finished = 1 WHERE id = ?`, [matchId]);
      const restore = stubFetch();
      try {
        await notify.matchFinished(matchId);
        const sent = restore();
        const texts = sent.map((s) => s.text);
        assert.equal(sent.length, 4); // tg 111/112 + vk 900 + чат 42
        for (const t of texts) {
          assert.match(t, /2:1/);
          assert.match(t, /21:15/);
          assert.match(t, /18:21/);
          assert.match(t, /21:19/);
        }
      } finally {
        restore();
      }
    });
  });

  describe("матч 110", () => {
    it("вызов и результат для пар команд", async () => {
      prepareTournament();
      const u1 = insertUser("111", null);
      const u2 = insertUser(null, "900");
      const u3 = insertUser("222", null);
      const u4 = insertUser(null, null);
      const [t1, t2] = createTeams([u1, u2], [u3, u4]);
      const matchId = db.run(
          `INSERT INTO match_110 (tournament_id, team_1_id, team_2_id, court_id) VALUES (1, ?, ?, 1)`,
          [t1, t2],
      ).id;
      const restore = stubFetch();
      try {
        await notify.matchCreated110(matchId);
        let sent = restore();
        assert.equal(sent.filter((s) => s.kind === "tg").length, 2);
        assert.equal(sent.filter((s) => s.kind === "vk" && s.userId).length, 1);
        assert.equal(sent.filter((s) => s.kind === "vk" && s.chatId).length, 1);
        assert.match(sent[0].text, /Игроков/);

        // команда 1 добрала 110-е очко
        db.run(
            `INSERT INTO game_110 (match_110_id, game_type_id, current, score_1, score_2, party_score_1, party_score_2, even_1_user_id, even_2_user_id)
             VALUES (?, 1, 0, 110, 87, 11, 8, ?, ?)`,
            [matchId, u1, u3],
        );
        db.run(`UPDATE match_110 SET finished = 1 WHERE id = ?`, [matchId]);
        const restore2 = stubFetch();
        try {
          await notify.matchFinished110(matchId);
          sent = restore2();
          assert.equal(sent.length, 4);
          for (const s of sent) {
            assert.match(s.text, /110:87/);
          }
        } finally {
          restore2();
        }
      } finally {
        restore();
      }
    });
  });

  it("нет VK_TOKEN — доставка в VK пропускается, TG работает, без падений", async () => {
    prepareTournament();
    delete process.env.VK_TOKEN;
    const u = insertUser("111", "900");
    const matchId = createMatch([u, u, u, u]);
    const restore = stubFetch();
    try {
      await notify.matchCreated(matchId);
      const sent = restore();
      assert.equal(sent.filter((s) => s.kind === "tg").length, 1);
      assert.equal(sent.filter((s) => s.kind === "vk").length, 0);
    } finally {
      restore();
    }
  });
});
