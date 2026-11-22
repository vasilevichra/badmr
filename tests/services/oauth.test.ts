import assert from "node:assert/strict";
import { describe, it } from "node:test";
import OAuthService from "../../src/services/oauth.ts";

const oauth = new OAuthService();

describe("OAuth", () => {
  describe("normalizeEmail", () => {
    it("приводит к нижнему регистру и тримит", () => {
      assert.strictEqual(oauth.normalizeEmail("  Roman@Example.COM "), "roman@example.com");
    });
    it("пустое и мусор — null", () => {
      assert.strictEqual(oauth.normalizeEmail(""), null);
      assert.strictEqual(oauth.normalizeEmail(null), null);
      assert.strictEqual(oauth.normalizeEmail("не-почта"), null);
    });
  });
  describe("normalizePhone", () => {
    it("вычищает форматирование и приводит 8 к +7", () => {
      assert.strictEqual(oauth.normalizePhone("+7 (900) 123-45-67"), "+79001234567");
      assert.strictEqual(oauth.normalizePhone("89001234567"), "+79001234567");
      assert.strictEqual(oauth.normalizePhone("79001234567"), "+79001234567");
    });
    it("невалидный номер — null", () => {
      assert.strictEqual(oauth.normalizePhone("+7952"), null);
      assert.strictEqual(oauth.normalizePhone(null), null);
      assert.strictEqual(oauth.normalizePhone("12345"), null);
    });
  });
});
