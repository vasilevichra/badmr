import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Express, { type Express as App } from "express";
import path from "node:path";
import IndexRouter from "../../src/routes/index.ts";
import type { AddressInfo } from "node:net";

const app: App = Express();
app.set("views", path.resolve(import.meta.dirname, "../../src/public/views"));
app.set("view engine", "ejs");
// заглушка express-useragent: обычный десктопный браузер
app.use((req, res, next) => {
  (req as unknown as { useragent: { isDesktop: boolean } }).useragent = { isDesktop: true };
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: number } }).user = { id: 1 };
  res.locals.csrfToken = "test";
  next();
});
app.use("/", IndexRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

describe("Tournament page", () => {
  it("должен отдать шаблоны форм подбора, игр и кнопок таблицы игроков", async () => {
    const res = await fetch(base);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /<template id="select-form-template">/);
    assert.match(html, /<template id="game-form-template">/);
    assert.match(html, /<template id="game-form-phone-template">/);
    assert.match(html, /<template id="player-toolbar-template">/);
  });

  it("должен перенаправить со слэша на страницу текущего турнира", async () => {
    // в тестовой БД текущий турнир — id 4 «Новая Лига»
    const res = await fetch(base, {redirect: "manual"});

    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get("location"), "/tournament/4");
  });

  it("должен открыть турнир по id из адресной строки", async () => {
    const res = await fetch(`${base}tournament/4`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /Новая Лига/);
    assert.match(html, /<template id="select-form-template">/);
  });

  it("должен открыть не текущий турнир по ссылке", async () => {
    // турнир 3 «ДЗР-Д» — тип «Рейтинг», не текущий
    const res = await fetch(`${base}tournament/3`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /ДЗР-Д/);
    // в переключателе выбран просматриваемый турнир, а не текущий
    assert.match(html, /<option value="3" selected/);
  });

  it("должен открыть турнир типа 110 по ссылке", async () => {
    // турнир 2 «110-1» — тип «110»
    const res = await fetch(`${base}tournament/2`);

    assert.strictEqual(res.status, 200);
  });

  it("должен отдать 404 для неизвестного турнира", async () => {
    const res = await fetch(`${base}tournament/999`);
    const html = await res.text();

    assert.strictEqual(res.status, 404);
    assert.match(html, /Неизвестный турнир/);
  });
});
