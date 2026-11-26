// Обобщённый каркас OAuth-провайдеров (VK ID, позже Apple):
// нормализация контактов, PKCE, верификация id_token (JWKS + статический ключ).
import crypto from "node:crypto";

export interface VkProfile {
  vkId: string;
  email: string | null;
  phone: string | null;
}

/** Адреса VK ID — константы, чтобы Apple потом лёг вторым конфигом. */
const AUTHORIZE_URL = "https://id.vk.ru/authorize";
const TOKEN_URL = "https://id.vk.ru/oauth2/auth";
const JWKS_URL = "https://id.vk.ru/oauth2/.well-known/jwks";
const USER_INFO_URL = "https://id.vk.ru/oauth2/user_info";
// VK выпускает токены с обоими issuer — принимаем оба
const ISSUERS = ["https://id.vk.com/", "https://id.vk.ru/"];
/** TTL кэша JWKS: ключи VK меняются редко, час — компромисс свежести и нагрузки. */
const JWKS_TTL_MS = 60 * 60 * 1000;

/**
 * Публичный ключ VK ID для проверки подписи id_token — опубликован в
 * официальной документации. JWKS-эндпоинт VK стабильно отвечает 403/404,
 * поэтому статика здесь не запасной вариант, а рабочий механизм;
 * при ротации ключа VK вход сломается — сигнал обновить константу.
 */
const VK_ID_TOKEN_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAvsvJlhFX9Ju/pvCz1frB
DgJs592VjdwQuRAmnlJAItyHkoiDIOEocPzgcUBTbDf1plDcTyO2RCkUt0pz0WK6
6HNhpJyIfARjaWHeUlv4TpuHXAJJsBKklkU2gf1cjID+40sWWYjtq5dAkXnSJUVA
UR+sq0lJ7GmTdJtAr8hzESqGEcSP15PTs7VUdHZ1nkC2XgkuR8KmKAUb388ji1Q4
n02rJNOPQgd9r0ac4N2v/yTAFPXumO78N25bpcuWf5vcL9e8THk/U2zt7wf+aAWL
748e0pREqNluTBJNZfmhC79Xx6GHtwqHyyduiqfPmejmiujNM/rqnA4e30Tg86Yn
cNZ6vLJyF72Eva1wXchukH/aLispbY+EqNPxxn4zzCWaLKHG87gaCxpVv9Tm0jSD
2es22NjrUbtb+2pAGnXbyDp2eGUqw0RrTQFZqt/VcmmSCE45FlcZMT28otrwG1ZB
kZAb5Js3wLEch3ZfYL8sjhyNRPBmJBrAvzrd8qa3rdUjkC9sKyjGAaHu2MNmFl1Y
JFQ3J54tGpkGgJjD7Kz3w0K6OiPDlVCNQN5sqXm24fCw85Pbi8SJiaLTp/CImrs1
Z3nHW5q8hljA7OGmqfOP0nZS/5zW9GHPyepsI1rW6CympYLJ15WeNzePxYS5KEX9
EncmkSD9b45ge95hJeJZteUCAwEAAQ==
-----END PUBLIC KEY-----`;

// kid в стандарте JWK есть, но в типах @types/node его нет — расширяем
type VkJwk = crypto.webcrypto.JsonWebKey & { kid?: string };

interface JwksEntry {
  keys: VkJwk[];
  fetchedAt: number;
}

let jwksCache: JwksEntry | null = null;

class OAuthService {
  /**
   * Email к канонической форме для сравнения с базой.
   * Инвариант: у двух пользователей один email ⇒ одна нормализованная строка.
   */
  normalizeEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const value = email.trim().toLowerCase();
    // регексп как в POST /api/users/email/:id — единые правила валидности
    if (!value || value.length > 100 ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ||
        (value.match(/@/g) ?? []).length !== 1) {
      return null;
    }
    return value;
  }

  /**
   * Телефон к формату схемы +79XXXXXXXXX. VK и база могут хранить
   * отформатированные номера — сравнивать можно только нормализованные.
   */
  normalizePhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/[^\d+]/g, "");
    if (digits.includes("+") && !digits.startsWith("+")) return null;
    let value = digits.replace(/\+/g, "");
    if (value.length === 11 && value.startsWith("8")) value = "7" + value.slice(1);
    if (!/^79\d{9}$/.test(value)) return null;
    return "+" + value;
  }

  /** Провайдер сконфигурирован — без секретов кнопки и роуты не работают. */
  configured(): boolean {
    return Boolean(process.env.VK_CLIENT_ID);
  }

  /**
   * Старт авторизации: state/nonce/verifier живут в сессии до callback —
   * там же intent, чтобы callback отличил вход от привязки.
   */
  startAuth(session: Record<string, unknown>, intent: "login" | "bind"): string {
    const state = crypto.randomBytes(16).toString("hex");
    const nonce = crypto.randomBytes(16).toString("hex");
    // PKCE: verifier из допустимого RFC-набора, challenge = S256(verifier)
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    session.oauth = { state, nonce, verifier, intent };

    const redirectUri = process.env.VK_REDIRECT_URI || "https://badmr.ru/api/auth/vk/callback";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.VK_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: "email phone",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return `${AUTHORIZE_URL}?${params}`;
  }

  /**
   * Callback: state из сессии → обмен кода → верификация id_token → user_info.
   * Любой провал — Error с человеческим сообщением (роут покажет через flash).
   */
  async handleCallback(req: {
    query: { code?: string; state?: string; error?: string; device_id?: string };
    session: Record<string, unknown>;
  }): Promise<VkProfile> {
    const oauthSession = req.session.oauth as
      { state?: string; nonce?: string; verifier?: string } | undefined;
    delete req.session.oauth;

    if (!oauthSession?.state) {
      throw new Error("Сессия для входа через VK истекла, попробуйте ещё раз");
    }
    if (req.query.state !== oauthSession.state) {
      throw new Error("Подозрительный вход через VK: state не совпал, повторите попытку");
    }
    // отказ в согласии приходит с error=access_denied и пустым code —
    // отделяем его от сетевых проблем, чтобы не пугать пользователя
    if (req.query.error) {
      throw new Error("Вход через VK отменён");
    }

    // Контракт «Сервер авторизации 2.1» (документация VK ID, 2026): обмен кода
    // идёт на oauth2/auth с grant_type и device_id — обязательным спутником code
    // из колбэка. Для публичных приложений секрет не нужен, PKCE закрывает обмен;
    // конфиденциальные дополнительно передают service_token из кабинета VK.
    const tokenData = await this.postJson<{ access_token?: string; id_token?: string }>(
        TOKEN_URL,
        {
          grant_type: "authorization_code",
          code: req.query.code ?? "",
          client_id: process.env.VK_CLIENT_ID!,
          redirect_uri: process.env.VK_REDIRECT_URI || "https://badmr.ru/api/auth/vk/callback",
          code_verifier: oauthSession.verifier ?? "",
          state: oauthSession.state,
          device_id: req.query.device_id ?? "",
          ...(process.env.VK_SERVICE_TOKEN ? { service_token: process.env.VK_SERVICE_TOKEN } : {}),
        },
        "запроса токена",
    );
    if (!tokenData.access_token || !tokenData.id_token) {
      throw new Error("VK не вернул токен, попробуйте войти ещё раз");
    }

    const payload = await this.verifyIdToken(tokenData.id_token, oauthSession.nonce!);
    if (!payload.sub) {
      throw new Error("В токене VK нет идентификатора пользователя");
    }

    const userInfo = await this.postJson<{ user?: { email?: string; phone?: string } }>(
        USER_INFO_URL,
        { access_token: tokenData.access_token, client_id: process.env.VK_CLIENT_ID! },
        "запроса профиля",
    );

    return {
      vkId: payload.sub,
      email: this.normalizeEmail(userInfo.user?.email),
      phone: this.normalizePhone(userInfo.user?.phone),
    };
  }

  /**
   * POST к VK с обязательным JSON-ответом. VK на часть ошибок отвечает
   * HTML-страницей — разбор такого тела кидает SyntaxError с машинным
   * сообщением; вместо него наружу идёт человеческое с HTTP-статусом.
   */
  private async postJson<T>(url: string, body: Record<string, string>, what: string): Promise<T> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
    const text = await response.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new Error(`VK ответил не-JSON (${response.status}) на ${what}, попробуйте позже`);
    }
    return data;
  }

  /** Проверки id_token: подпись по JWKS, iss, aud, exp, nonce. */
  private async verifyIdToken(idToken: string, nonce: string) {
    const [headerB64, payloadB64, sigB64] = idToken.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) {
      throw new Error("Некорректный токен VK");
    }
    // alg фиксируем на своей стороне: подпись проверяется только RSA-SHA256,
    // алгоритм из заголовка токена никогда не выбирает схему проверки
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString()) as
      { alg?: string; kid?: string };
    if (header.alg !== "RS256") throw new Error("Неподдерживаемый алгоритм токена VK");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as {
      iss?: string; aud?: string | string[]; exp?: number; nonce?: string; sub?: string;
    };

    const now = Math.floor(Date.now() / 1000);
    if (!ISSUERS.includes(payload.iss ?? "")) throw new Error("Токен VK выпущен неизвестным сервисом");
    const clientId = process.env.VK_CLIENT_ID!;
    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(clientId) : payload.aud === clientId;
    if (!audOk) throw new Error("Токен VK выдан другому приложению");
    if (!payload.exp || payload.exp < now) throw new Error("Токен VK истёк, войдите заново");
    if (payload.nonce !== nonce) throw new Error("Подозрительный вход через VK: nonce не совпал");

    const signature = Buffer.from(sigB64, "base64url");
    const signed = `${headerB64}.${payloadB64}`;
    const verify = (key: crypto.KeyObject) => crypto.createVerify("RSA-SHA256")
      .update(signed)
      .verify(key, signature);

    // провал верификации — повод один раз принудительно обновить JWKS: после
    // ротации ключей VK вход не должен ломаться до истечения часового кэша;
    // если JWKS по-прежнему недоступен — остаёмся на статическом ключе
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const keys = await this.signingKeys(attempt > 0);
      ok = keys.some(verify);
    }
    if (!ok) throw new Error("Подпись токена VK не прошла проверку");

    return payload;
  }

  /**
   * Ключи для проверки подписи: сначала JWKS, при его недоступности —
   * статический публичный ключ из документации. Провал загрузки кэшируется
   * на тот же TTL, чтобы каждый логин не долбил заведомо мёртвый эндпоинт.
   */
  private async signingKeys(forceRefresh = false): Promise<crypto.KeyObject[]> {
    if (forceRefresh || !jwksCache || Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS) {
      try {
        await this.fetchJwks();
      } catch {
        jwksCache = { keys: [], fetchedAt: Date.now() };
      }
    }
    const jwkKeys = jwksCache!.keys.map(jwk => crypto.createPublicKey({ key: jwk, format: "jwk" }));
    return jwkKeys.length ? jwkKeys : [crypto.createPublicKey(VK_ID_TOKEN_PUBLIC_KEY)];
  }

  private async fetchJwks(): Promise<void> {
    const response = await fetch(JWKS_URL, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json() as { keys?: VkJwk[] };
    if (!data.keys?.length) throw new Error("VK не отдал публичные ключи для проверки токена");
    jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  }

  /** Только тестами: чистый JWKS-кэш между кейсами. */
  resetJwksCache(): void {
    jwksCache = null;
  }
}

export default OAuthService;
