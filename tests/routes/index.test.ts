import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Express, { type Express as App } from "express";
import path from "node:path";
import IndexRouter from "../../src/routes/index.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import TournamentService from "../../src/services/tournament.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";
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
    // на турнире есть зарегистрированные — блок «Игроки» на месте
    assert.match(html, /id="player-table"/);
  });

  it("не должен показывать блок «Игроки», когда на турнире нет зарегистрированных игроков", async () => {
    const tournamentService = new TournamentService();
    const id = await tournamentService.create(
        1, 1, 1, 1, "Тест без игроков",
        "2026-01-01 00:00:00", "2026-01-02 00:00:00", "2026-01-03 00:00:00",
        100, 1, "0", "100", null, 0,
    );

    const res = await fetch(`${base}tournament/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.doesNotMatch(html, /id="player-table"/);
    assert.match(html, /id="registration"/); // регистрация остаётся — иначе некому добавить первого игрока
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

describe("Время розыгрыша в футере", () => {
  const matchService = new MatchService();
  const gameService = new GameService();
  const db = new Repository().db;

  const seedUsers = async (): Promise<number[]> => {
    const userService = new UserService();
    const ids: number[] = [];
    for (const u of [
      { lastname: "Розыгрыш", firstname: "Андрей" },
      { lastname: "Очко", firstname: "Борис" },
      { lastname: "Секунда", firstname: "Вера" },
      { lastname: "Минута", firstname: "Григорий" },
    ]) {
      const { id } = await userService.create(u.lastname, u.firstname, "Отчество", 500, 1, 1, "1990-01-01");
      ids.push(id);
    }
    await userService.registerByIds(ids);
    return ids;
  };

  it("должен показывать медианное время одного очка в формате «Nм Nс»", async () => {
    await clean();
    const ids = await seedUsers();

    // матч A (текущий турнир): игры в 10:30:00 и 11:30:15 → длительность
    // с начала матча (10:00:00) 5415 с; очки 21:5 (26) + 21:10 (31) = 57
    // → ровно 95 с/очко → «1м 35с»
    await matchService.create(...(ids as [number, number, number, number]));
    const a = (await matchService.getAll() as { id: number }[]).at(-1)!.id;
    await gameService.create(a, null, "5", "2026-01-01 10:30:00");
    await gameService.create(a, null, "10", "2026-01-01 11:30:15");
    // матч B (другой турнир): длительность 600 с, очки 31 + 31 = 62
    // → за всё время (5415 + 600) / (57 + 62) ≈ 50.5 → 51 → «51с»
    await matchService.create(...(ids as [number, number, number, number]));
    const b = (await matchService.getAll() as { id: number }[]).at(-1)!.id;
    await gameService.create(b, null, "10", "2026-01-01 12:05:00");
    await gameService.create(b, null, "10", "2026-01-01 12:10:00");

    db.exec(`UPDATE match SET created_at = '2026-01-01 10:00:00' WHERE id = ${a}`);
    db.exec(`UPDATE match SET created_at = '2026-01-01 12:00:00', tournament_id = 1 WHERE id = ${b}`);

    const res = await fetch(`${base}tournament/4`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    // блок «Статистика» после блока «Достижения»: таблица (Параметр | Турнир | За всё время)
    assert.match(html, /<h1[^>]*>Статистика<\/h1>/);
    assert.match(html, /<th[^>]*>Параметр<\/th>\s*<th[^>]*>Турнир<\/th>\s*<th[^>]*>За всё время<\/th>/);
    // медиана секунд на очко: текущий — 5415/57 ≈ 94.9 → 95 → «1м 35с»;
    // за всё время — медиана {94.9, 9.7} ≈ 52.3 → «52с»
    assert.match(html, /<td[^>]*><math><mover accent="true"><mi>t<\/mi><mo>‾<\/mo><\/mover><\/math> розыгрыша<\/td>\s*<td[^>]*>1м 35с<\/td>\s*<td[^>]*>52с<\/td>/);
    // медиана времени игры: текущий — {1800, 3615} → 2707.5 с → «45м 8с»;
    // за всё время — {300, 300, 1800, 3615} → (300 + 1800) / 2 = 1050 с → «17м 30с»
    assert.match(html, /<td[^>]*><math><mover accent="true"><mi>t<\/mi><mo>‾<\/mo><\/mover><\/math> игры<\/td>\s*<td[^>]*>45м 8с<\/td>\s*<td[^>]*>17м 30с<\/td>/);
    // медиана времени матча: текущий — 5415 с → «90м 15с»;
    // за всё время — {600, 5415} → 3007.5 с → «50м 8с»
    assert.match(html, /<td[^>]*><math><mover accent="true"><mi>t<\/mi><mo>‾<\/mo><\/mover><\/math> матча<\/td>\s*<td[^>]*>90м 15с<\/td>\s*<td[^>]*>50м 8с<\/td>/);
    // игр в матче: по 2 игры в каждом матче → «2»
    assert.match(html, /<td[^>]*>Игр в матче<\/td>\s*<td[^>]*>2<\/td>\s*<td[^>]*>2<\/td>/);
    assert.ok(html.indexOf('id="achievement"') < html.indexOf('id="stats"'));
    // «Статистика» — последний блок страницы: после админских блоков («Архив» последний из них)
    assert.ok(html.indexOf('id="player-archive"') < html.indexOf('id="stats"'));
  });

  it("должен показывать прочерк без подходящих матчей", async () => {
    await clean();
    const res = await fetch(`${base}tournament/4`);
    const html = await res.text();

    assert.match(html, /<td[^>]*><math><mover accent="true"><mi>t<\/mi><mo>‾<\/mo><\/mover><\/math> розыгрыша<\/td>\s*<td[^>]*>—<\/td>\s*<td[^>]*>—<\/td>/);
  });
});

describe("Tournament page for guest", () => {
  // отдельное приложение: гость (нет req.user)
  const guestApp: App = Express();
  guestApp.set("views", path.resolve(import.meta.dirname, "../../src/public/views"));
  guestApp.set("view engine", "ejs");
  guestApp.use((req, res, next) => {
    (req as unknown as { useragent: { isDesktop: boolean } }).useragent = { isDesktop: true };
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
    res.locals.csrfToken = "test";
    next();
  });
  guestApp.use("/", IndexRouter);

  const guestServer = guestApp.listen(0);
  const guestBase = `http://127.0.0.1:${(guestServer.address() as AddressInfo).port}/`;

  it("не должен показывать заголовок блока «Статистика»", async () => {
    await clean();
    const res = await fetch(`${guestBase}tournament/4`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    // заголовок блока — как у «Игроков» и «Истории матчей» — только авторизованным
    assert.doesNotMatch(html, /<h1[^>]*>Статистика<\/h1>/);
    // сама таблица статистики гостю видна
    assert.match(html, /<th[^>]*>Параметр<\/th>\s*<th[^>]*>Турнир<\/th>\s*<th[^>]*>За всё время<\/th>/);
  });
});

describe("Нумерация истории матчей", () => {
  const matchService = new MatchService();
  const gameService = new GameService();

  it("должен нумеровать матчи хронологически: старейший — №1 внизу, новейший — №N сверху", async () => {
    await clean();
    const userService = new UserService();
    const ids: number[] = [];
    for (const u of [
      { lastname: "История", firstname: "Андрей" },
      { lastname: "Номер", firstname: "Борис" },
      { lastname: "Порядок", firstname: "Вера" },
      { lastname: "Список", firstname: "Григорий" },
    ]) {
      const { id } = await userService.create(u.lastname, u.firstname, "Отчество", 500, 1, 1, "1990-01-01");
      ids.push(id);
    }
    await userService.registerByIds(ids);

    // два завершённых матча: a создан раньше (id меньше), b — позже
    const created: number[] = [];
    for (const _ of [1, 2]) {
      await matchService.create(...(ids as [number, number, number, number]));
      const id = (await matchService.getAll() as { id: number }[]).at(-1)!.id;
      await gameService.create(id, null, "10", "2026-01-01 10:00:00");
      await gameService.create(id, null, "10", "2026-01-01 10:01:00");
      created.push(id);
    }
    const [a, b] = created;

    const res = await fetch(`${base}tournament/4`);
    const html = await res.text();

    // список сверху вниз: новейший (b) первым с номером №2, старейший (a) — №1
    const numbers = [...html.matchAll(/match-history-info[^>]*>№(\d+) \((\d+)\)/g)]
      .map((m) => [Number(m[1]), Number(m[2])]);
    assert.deepStrictEqual(numbers, [[2, b], [1, a]]);
  });
});
