/** Интеграция с VK: чаты турниров в сообществе «Бадминтон в Доброграде».
 *
 * Используется ключ доступа сообщества (process.env.VK_TOKEN, права messages).
 * messages.createChat создаёт чат от имени сообщества, участники заходят
 * по ссылке-приглашению (messages.getInviteLink), ссылка хранится
 * в tournament.chat. Чат, созданный ключом сообщества, не отображается
 * во вкладке «Чаты» интерфейса сообщества (ограничение VK API). */
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

  /** Создаёт чат с названием турнира и возвращает ссылку-приглашение. */
  createChat = async (title: string): Promise<string | undefined> => {
    const created = await this.call<{ chat_id: number }>("messages.createChat", { title });
    const invite = await this.call<{ link: string }>("messages.getInviteLink", {
      peer_id: String(CHAT_PEER_BASE + created.chat_id),
      reset: "0",
    });
    return invite.link;
  };
}

export default Vk;
