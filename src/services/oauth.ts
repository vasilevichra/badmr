// Обобщённый каркас OAuth-провайдеров (VK ID, позже Apple):
// нормализация контактов, PKCE, верификация id_token по JWKS.
import crypto from "node:crypto";

export interface VkProfile {
  vkId: string;
  email: string | null;
  phone: string | null;
}

/** Адреса VK ID — константы, чтобы Apple потом лёг вторым конфигом. */
const AUTHORIZE_URL = "https://id.vk.com/authorize";
const TOKEN_URL = "https://id.vk.com/oauth2/get_token";
const JWKS_URL = "https://id.vk.com/.well-known/jwks";
const USER_INFO_URL = "https://id.vk.com/oauth2/user_info";
const ISSUER = "https://id.vk.com/";
/** TTL кэша JWKS: ключи VK меняются редко, час — компромисс свежести и нагрузки. */
const JWKS_TTL_MS = 60 * 60 * 1000;

interface JwksEntry {
  keys: crypto.webcrypto.JsonWebKey[];
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
    return Boolean(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET);
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
    query: { code?: string; state?: string };
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

    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: req.query.code ?? "",
        client_id: process.env.VK_CLIENT_ID!,
        client_secret: process.env.VK_CLIENT_SECRET!,
        redirect_uri: process.env.VK_REDIRECT_URI || "https://badmr.ru/api/auth/vk/callback",
        code_verifier: oauthSession.verifier ?? "",
        state: oauthSession.state,
      }),
    });
    const tokenData = await tokenResponse.json() as { access_token?: string; id_token?: string };
    if (!tokenData.access_token || !tokenData.id_token) {
      throw new Error("VK не вернул токен, попробуйте войти ещё раз");
    }

    const payload = await this.verifyIdToken(tokenData.id_token, oauthSession.nonce!);
    if (!payload.sub) {
      throw new Error("В токене VK нет идентификатора пользователя");
    }

    const userInfoResponse = await fetch(USER_INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: tokenData.access_token }),
    });
    const userInfo = await userInfoResponse.json() as {
      user?: { email?: string; phone?: string };
    };

    return {
      vkId: payload.sub,
      email: this.normalizeEmail(userInfo.user?.email),
      phone: this.normalizePhone(userInfo.user?.phone),
    };
  }

  /** Проверки id_token: подпись по JWKS, iss, aud, exp, nonce. */
  private async verifyIdToken(idToken: string, nonce: string) {
    const [headerB64, payloadB64, sigB64] = idToken.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) {
      throw new Error("Некорректный токен VK");
    }
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as {
      iss?: string; aud?: string | string[]; exp?: number; nonce?: string; sub?: string;
    };

    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== ISSUER) throw new Error("Токен VK выпущен неизвестным сервисом");
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (aud !== process.env.VK_CLIENT_ID) throw new Error("Токен VK выдан другому приложению");
    if (!payload.exp || payload.exp < now) throw new Error("Токен VK истёк, войдите заново");
    if (payload.nonce !== nonce) throw new Error("Подозрительный вход через VK: nonce не совпал");

    const key = await this.jwkForSignature();
    const signature = Buffer.from(sigB64, "base64url");
    const ok = crypto.createVerify("RSA-SHA256")
      .update(`${headerB64}.${payloadB64}`)
      .verify(crypto.createPublicKey({ key, format: "jwk" }), signature);
    if (!ok) throw new Error("Подпись токена VK не прошла проверку");

    return payload;
  }

  /** JWKS с кэшем в памяти процесса; без сети при повторных входах. */
  private async jwkForSignature(): Promise<crypto.webcrypto.JsonWebKey> {
    if (!jwksCache || Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS) {
      const response = await fetch(JWKS_URL);
      const data = await response.json() as { keys?: crypto.webcrypto.JsonWebKey[] };
      if (!data.keys?.length) throw new Error("VK не отдал публичные ключи для проверки токена");
      jwksCache = { keys: data.keys, fetchedAt: Date.now() };
    }
    return jwksCache.keys[0];
  }

  /** Только тестами: чистый JWKS-кэш между кейсами. */
  resetJwksCache(): void {
    jwksCache = null;
  }
}

export default OAuthService;
