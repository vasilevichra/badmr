import crypto from "crypto";
import UserRepository from "../repositories/user.ts";
import UserService from "./user.ts";

const API = "https://api.telegram.org/bot";
// алфавит одноразовых кодов: без I/L/O/0/1 — не путаются при ручном вводе
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface BindCode {
  userId: number;
  expires: number;
}

interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    // @username нужен для ссылки t.me из карточки игрока
    from?: { username?: string };
  };
}

/** Привязка Telegram через бота: сайт выдаёт одноразовый код, игрок
 *  отправляет его боту командой /start, бот в ответе getUpdates несёт
 *  числовой id чата — верифицированный идентификатор, пишем в user.tg_id.
 *  Бот работает long polling'ом (getUpdates) внутри процесса сервера —
 *  без вебхуков и домена; коды живут в памяти и переживают только
 *  TTL (15 минут), рестарт сервера просто требует новый код.
 *  Состояние (коды, offset, poller) статическое: инстансы роута и точки
 *  входа разделяют его, TTL в конструкторе — для тестов. */
class TgBot {
  private static codes = new Map<string, BindCode>();
  private static offset = 0;
  private static username: string | null = null;
  private static running = false;

  private readonly user = new UserRepository();
  private readonly userService = new UserService();
  private readonly token = process.env.TG_BOT_TOKEN ?? "";
  private readonly ttlMs: number;

  constructor(ttlMinutes = 15) {
    this.ttlMs = ttlMinutes * 60_000;
  }

  configured = () => Boolean(this.token);

  /** Сообщение в чат Telegram (для уведомлений, не только привязки). */
  send = async (chatId: number | string, text: string): Promise<void> => this.reply(chatId, text);

  /** Сброс статического состояния — изоляция тестов. */
  static reset() {
    TgBot.codes.clear();
    TgBot.offset = 0;
    TgBot.username = null;
    TgBot.running = false;
  }

  /** Код и ссылка на бота. Предыдущие коды игрока НЕ гасятся: повторный
   *  клик «Привязать» — обычное дело (закрылось окно, не дошёл пуш),
   *  коды безвредны, пока не истёк TTL. Протухшие вычищаются тут же. */
  async startBind(userId: number): Promise<{ code: string; botLink: string }> {
    for (const [code, rec] of TgBot.codes) {
      if (rec.expires <= Date.now()) {
        TgBot.codes.delete(code);
      }
    }
    const code = Array.from({length: 6}, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
    TgBot.codes.set(code, {userId, expires: Date.now() + this.ttlMs});
    const username = await this.botName();
    return {code, botLink: `https://t.me/${username}?start=${code}`};
  }

  /** Есть ли у игрока проставленный tg_id (опрос статуса с карточки). */
  isBound = (userId: number): boolean =>
    Boolean(this.user.db.get<{ v: string | null }>(
        `SELECT tg_id AS v FROM user WHERE id = ?`, [userId],
    )!.v);

  /** Один цикл getUpdates: обрабатывает накопившиеся сообщения,
   *  возвращает offset следующего запроса. */
  async pollOnce(): Promise<number> {
    const updates = await this.getUpdates(0);
    for (const u of updates) {
      this.handle(u);
      TgBot.offset = u.update_id + 1;
    }
    return TgBot.offset;
  }

  /** Постоянный long polling; ошибки сети не останавливают цикл. */
  start() {
    if (TgBot.running || !this.configured()) {
      return;
    }
    TgBot.running = true;
    void (async () => {
      while (TgBot.running) {
        try {
          const updates = await this.getUpdates(25, 35_000);
          for (const u of updates) {
            this.handle(u);
            TgBot.offset = u.update_id + 1;
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    })();
  }

  private async getUpdates(timeoutSec: number, abortMs?: number): Promise<TgUpdate[]> {
    const res = await fetch(
        `${API}${this.token}/getUpdates?offset=${TgBot.offset}&timeout=${timeoutSec}`,
        abortMs ? {signal: AbortSignal.timeout(abortMs)} : undefined,
    );
    const data = await res.json() as { ok: boolean; result?: TgUpdate[] };
    return data.result ?? [];
  }

  private async botName(): Promise<string> {
    if (!TgBot.username) {
      const res = await fetch(`${API}${this.token}/getMe`);
      const data = await res.json() as { ok: boolean; result?: { username?: string } };
      if (!data.ok || !data.result?.username) {
        throw new Error("getMe failed");
      }
      TgBot.username = data.result.username;
    }
    return TgBot.username;
  }

  private async handle(u: TgUpdate): Promise<void> {
    const chatId = u.message?.chat.id;
    const text = u.message?.text ?? "";
    if (!chatId || !text.startsWith("/start")) {
      return;
    }
    const code = text.split(/\s+/)[1]?.toUpperCase() ?? "";
    const rec = TgBot.codes.get(code);
    if (!rec) {
      // код не удаляем при отказе: повторная попытка с тем же сообщением
      // не должна усугублять (диагностика — в журнал)
      console.log(`tg-bind: отказ, код "${code}" не выдан (чат ${chatId})`);
      return this.reply(chatId, "Код не найден или устарел — получите новый в карточке игрока.");
    }
    if (rec.expires <= Date.now()) {
      TgBot.codes.delete(code);
      console.log(`tg-bind: отказ, код "${code}" просрочен (игрок ${rec.userId}, чат ${chatId})`);
      return this.reply(chatId, "Код не найден или устарел — получите новый в карточке игрока.");
    }
    const occupied = this.user.db.get<{ id: number }>(
        `SELECT id FROM user WHERE tg_id = ?`, [String(chatId)],
    );
    if (occupied && occupied.id !== rec.userId) {
      console.log(`tg-bind: отказ, чат ${chatId} уже у игрока ${occupied.id}`);
      return this.reply(chatId, "Этот Telegram уже привязан к другому аккаунту.");
    }
    if (occupied) {
      // повторная привязка тем же чатом — состояние не меняется;
      // @username мог смениться — обновляем
      TgBot.codes.delete(code);
      if (u.message?.from?.username) {
        this.userService.setTgUsername(occupied.id, u.message.from.username);
      }
      return this.reply(chatId, "Этот Telegram уже привязан к вашему аккаунту.");
    }
    // числовой id Telegram стабилен, в отличие от @username — храним его;
    // @username — в дополнение, для ссылки t.me из карточки;
    // код гасим только после успешной записи — сбой записи оставляет retry
    await this.userService.setTg(rec.userId, String(chatId));
    if (u.message?.from?.username) {
      this.userService.setTgUsername(rec.userId, u.message.from.username);
    }
    TgBot.codes.delete(code);
    console.log(`tg-bind: игрок ${rec.userId} привязан к чату ${chatId}`);
    return this.reply(chatId, "Telegram привязан к вашему аккаунту.");
  }

  private async reply(chatId: number | string, text: string): Promise<void> {
    await fetch(`${API}${this.token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}`);
  }
}

export default TgBot;
