/** Уведомления о матчах: вызов (создание) и результат.
 *
 * Каналы на каждого из 4 игроков: Telegram-бот (по привязанному tg_id),
 * личка VK (по привязанному vk_id, если игрок разрешил сообщения
 * сообщества) и чат турнира VK. Доставка фоновая: сбой канала пишется
 * в журнал и не влияет на матч. В dev-режиме реальных отправок нет. */
import TgBotService from "./tg-bot.ts";
import Vk from "./vk.ts";
import UserRepository from "../repositories/user.ts";

interface Player {
  id: number;
  name: string;
  tg_id: string | null;
  vk_id: string | null;
}

interface MatchInfo {
  tournament: string;
  courtNumber: number;
  players: Player[][]; // [команда 1 (2 игрока), команда 2 (2 игрока)]
  vkChatId: number | null;
  chat: string | null; // ссылка-приглашение — для восстановления chat_id
}

const vk = new Vk();
const userRepository = new UserRepository();
const db = userRepository.db;

class Notify {
  /** Вызов: обычный матч (4 игрока). */
  matchCreated = async (matchId: number): Promise<void> => {
    const m = this.matchInfo(matchId);
    if (!m) return;
    const [t1, t2] = m.players;
    const text = `⚔️ ${m.tournament}: вызов на корт ${m.courtNumber} — ` +
        `${t1[0]?.name} и ${t1[1]?.name} против ${t2[0]?.name} и ${t2[1]?.name}`;
    await this.deliver(m, text);
  };

  /** Вызов: матч 110 (пары команд). */
  matchCreated110 = async (matchId: number): Promise<void> => {
    const m = this.match110Info(matchId);
    if (!m) return;
    const [t1, t2] = m.players;
    const text = `⚔️ ${m.tournament}: вызов на корт ${m.courtNumber} — ` +
        `${t1.map((p) => p.name).join(" и ")} против ${t2.map((p) => p.name).join(" и ")}`;
    await this.deliver(m, text);
  };

  /** Результат обычного матча: победа 2:x, счёт по геймам. */
  matchFinished = async (matchId: number): Promise<void> => {
    const m = this.matchInfo(matchId);
    if (!m) return;
    const games = db.all<{ score_1: number; score_2: number }>(
        `SELECT score_1, score_2 FROM game WHERE match_id = ? ORDER BY id`,
        [matchId],
    );
    const wins = games.reduce(
        (acc, g) => [acc[0] + (g.score_1 > g.score_2 ? 1 : 0), acc[1] + (g.score_2 > g.score_1 ? 1 : 0)] as [number, number],
        [0, 0] as [number, number],
    );
    const [t1, t2] = m.players;
    const text = `✅ ${m.tournament}: ${t1.map((p) => p.name).join(" / ")} — ` +
        `${t2.map((p) => p.name).join(" / ")} ${wins[0]}:${wins[1]}` +
        ` (${games.map((g) => `${g.score_1}:${g.score_2}`).join(", ")})`;
    await this.deliver(m, text);
  };

  /** Результат матча 110: кумулятивный счёт до 110 очков. */
  matchFinished110 = async (matchId: number): Promise<void> => {
    const m = this.match110Info(matchId);
    if (!m) return;
    const last = db.get<{ score_1: number; score_2: number }>(
        `SELECT score_1, score_2 FROM game_110 WHERE match_110_id = ? ORDER BY id DESC LIMIT 1`,
        [matchId],
    );
    if (!last) return;
    const [t1, t2] = m.players;
    const text = `✅ ${m.tournament}: ${t1.map((p) => p.name).join(" / ")} — ` +
        `${t2.map((p) => p.name).join(" / ")} ${last.score_1}:${last.score_2}`;
    await this.deliver(m, text);
  };

  /** Строка матча + игроки обеих пар (tg_id/vk_id для доставки). */
  private matchInfo(matchId: number): MatchInfo | undefined {
    const m = db.get<{ tournament: string; court_number: number; vk_chat_id: number | null; chat: string | null }>(
        `SELECT t.name AS tournament, c.number AS court_number, t.vk_chat_id, t.chat
         FROM match m
                  JOIN tournament t ON t.id = m.tournament_id
                  JOIN court c ON c.id = m.court_id
         WHERE m.id = ?`,
        [matchId],
    );
    if (!m) return undefined;
    const rows = db.all<{ id: number; name: string; tg_id: string | null; vk_id: string | null }>(
        `SELECT u.id, rtrim(u.lastname || ' ' || u.firstname) AS name, u.tg_id, u.vk_id
         FROM user u
         WHERE u.id IN (SELECT user_1_id FROM match WHERE id = ?
                        UNION SELECT user_2_id FROM match WHERE id = ?
                        UNION SELECT user_3_id FROM match WHERE id = ?
                        UNION SELECT user_4_id FROM match WHERE id = ?)`,
        [matchId, matchId, matchId, matchId],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const mt = db.get<{ user_1_id: number; user_2_id: number; user_3_id: number; user_4_id: number }>(
        `SELECT user_1_id, user_2_id, user_3_id, user_4_id FROM match WHERE id = ?`,
        [matchId],
    )!;
    const pick = (id: number): Player | undefined => {
      const r = byId.get(id);
      return r ? { id: r.id, name: r.name, tg_id: r.tg_id, vk_id: r.vk_id } : undefined;
    };
    return {
      tournament: m.tournament,
      courtNumber: m.court_number,
      vkChatId: m.vk_chat_id,
      chat: m.chat,
      players: [
        [pick(mt.user_1_id), pick(mt.user_2_id)],
        [pick(mt.user_3_id), pick(mt.user_4_id)],
      ].map((team) => team.filter((p): p is Player => Boolean(p))),
    };
  }

  /** Строка матча 110 + игроки обеих команд (в порядке team_user). */
  private match110Info(matchId: number): MatchInfo | undefined {
    const m = db.get<{ tournament: string; court_number: number; vk_chat_id: number | null; chat: string | null }>(
        `SELECT t.name AS tournament, c.number AS court_number, t.vk_chat_id, t.chat
         FROM match_110 m
                  JOIN tournament t ON t.id = m.tournament_id
                  JOIN court c ON c.id = m.court_id
         WHERE m.id = ?`,
        [matchId],
    );
    if (!m) return undefined;
    const teams = db.all<{ team_id: number; id: number; name: string; tg_id: string | null; vk_id: string | null }>(
        `SELECT tu.team_id, u.id, rtrim(u.lastname || ' ' || u.firstname) AS name, u.tg_id, u.vk_id
         FROM match_110 m
                  JOIN team_user tu ON tu.team_id IN (m.team_1_id, m.team_2_id)
                  JOIN user u ON u.id = tu.user_id
         WHERE m.id = ?
         ORDER BY tu.team_id, tu.id`,
        [matchId],
    );
    const mt = db.get<{ team_1_id: number; team_2_id: number }>(
        `SELECT team_1_id, team_2_id FROM match_110 WHERE id = ?`,
        [matchId],
    )!;
    return {
      tournament: m.tournament,
      courtNumber: m.court_number,
      vkChatId: m.vk_chat_id,
      chat: m.chat,
      players: [mt.team_1_id, mt.team_2_id].map((tid) =>
          teams.filter((r) => r.team_id === tid).map((r) => ({ id: r.id, name: r.name, tg_id: r.tg_id, vk_id: r.vk_id })),
      ),
    };
  }

  /** Доставка во все каналы; сбой одного канала не отменяет остальные. */
  private async deliver(m: MatchInfo, text: string): Promise<void> {
    if (process.env.NODE_ENV === "dev") {
      console.log(`notify (dev): ${text}`);
      return;
    }
    const tg = new TgBotService();
    // игрок теоретически в обеих парах (тестовые сиды) — получатели без дублей
    const players = [...new Map(m.players.flat().map((p) => [p.id, p])).values()];
    await Promise.allSettled([
      ...players.filter((p) => p.tg_id)
          .map((p) => tg.send(p.tg_id!, text).catch((e: Error) =>
              console.error(`notify tg ${p.tg_id}:`, e.message))),
      ...players.filter((p) => p.vk_id)
          .map((p) => vk.sendToUser(p.vk_id!, text).catch((e: Error) =>
              console.error(`notify vk ${p.vk_id}:`, e.message))),
      this.deliverChat(m, text),
    ]);
  }

  /** Чат турнира: vk_chat_id, для старых турниров — восстановление по ссылке. */
  private async deliverChat(m: MatchInfo, text: string): Promise<void> {
    try {
      let chatId = m.vkChatId;
      if (!chatId && m.chat) {
        chatId = await vk.chatIdByLink(m.chat) ?? null;
        if (chatId) {
          console.log(`notify: vk_chat_id турнира восстановлен по ссылке: ${chatId}`);
        }
      }
      if (chatId) {
        await vk.sendToChat(chatId, text);
      }
    } catch (e) {
      console.error("notify vk chat:", (e as Error).message);
    }
  }
}

export default Notify;
