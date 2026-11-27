/** Интеграция с VK: чаты турниров в сообществе «Бадминтон в Доброграде».
 *
 * Используется ключ доступа сообщества (process.env.VK_TOKEN, права messages).
 * messages.createChat создаёт чат от имени сообщества, участники заходят
 * по ссылке-приглашению (messages.getInviteLink), ссылка хранится
 * в tournament.chat, id чата — в tournament.vk_chat_id. Чат, созданный
 * ключом сообщества, не отображается
 * во вкладке «Чаты» интерфейса сообщества (ограничение VK API). */
import crypto from "node:crypto";
const API_URL = "https://api.vk.com/method/";
const API_VERSION = "5.199";
const CHAT_PEER_BASE = 2000000000;

interface VkResponse<T> {
  response?: T;
  error?: { error_msg: string };
}

class Vk {
  declare static _instance: Vk | undefined;

  constructor() {
    if (Vk._instance) {
      return Vk._instance;
    }
    Vk._instance = this;
  }

  private call = async <T>(method: string, params: Record<string, string> = {}): Promise<T> => {
    const token = process.env.VK_TOKEN;
    if (!token) {
      throw new Error("VK_TOKEN не задан — создание чата недоступно");
    }
    const res = await fetch(API_URL + method, {
      method: "POST",
      body: new URLSearchParams({ ...params, access_token: token, v: API_VERSION }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json() as VkResponse<T>;
    if (data.error) {
      throw new Error(`VK ${method}: ${data.error.error_msg}`);
    }
    return data.response as T;
  };

  /** Создаёт чат с названием турнира: id чата (для отправки сообщений)
   *  и ссылка-приглашение. */
  createChat = async (title: string): Promise<{ chatId: number; link: string } | undefined> => {
    const created = await this.call<{ chat_id: number }>("messages.createChat", { title });
    const invite = await this.call<{ link: string }>("messages.getInviteLink", {
      peer_id: String(CHAT_PEER_BASE + created.chat_id),
      reset: "0",
    });
    return { chatId: created.chat_id, link: invite.link };
  };

  /** Личное сообщение пользователю от сообщества (vk_id — числовой id). */
  sendToUser = async (userId: number | string, text: string): Promise<void> => {
    await this.call("messages.send", {
      user_id: String(userId),
      message: text,
      random_id: String(crypto.randomInt(2 ** 31)),
    });
  };

  /** Сообщение в чат (vk_chat_id турнира). */
  sendToChat = async (chatId: number, text: string): Promise<void> => {
    await this.call("messages.send", {
      chat_id: String(chatId),
      message: text,
      random_id: String(crypto.randomInt(2 ** 31)),
    });
  };

  /** Ссылка на аватар пользователя (photo_100) — для карточки игрока. */
  userPhoto = async (vkId: string): Promise<string | undefined> => {
    const users = await this.call<{ photo_100?: string }[]>("users.get", {
      user_ids: String(vkId),
      fields: "photo_100",
    });
    return users?.[0]?.photo_100;
  };

  /** id чата по ссылке-приглашению — восстановление для турниров,
   *  созданных до хранения vk_chat_id (getChatPreview отдаёт id чата). */
  chatIdByLink = async (link: string): Promise<number | undefined> => {
    const preview = await this.call<{ chat?: { id?: number } }>("messages.getChatPreview", { link });
    return preview.chat?.id;
  };
}

export default Vk;
