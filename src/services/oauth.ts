// Обобщённый каркас OAuth-провайдеров (VK ID, позже Apple):
// нормализация контактов, PKCE, верификация id_token по JWKS.
import crypto from "node:crypto";

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
}

export default OAuthService;
