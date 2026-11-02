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
    assert.strictEqual(res.headers.get("location"), "/t/4");
  });

  it("должен перенаправить старую ссылку /tournament/:id на /t/:id", async () => {
    const res = await fetch(`${base}tournament/4`, {redirect: "manual"});

    assert.strictEqual(res.status, 301);
    assert.strictEqual(res.headers.get("location"), "/t/4");
  });

  it("должен открыть турнир по id из адресной строки", async () => {
    const res = await fetch(`${base}t/4`);
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

    const res = await fetch(`${base}t/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.doesNotMatch(html, /id="player-table"/);
    assert.match(html, /id="registration"/); // регистрация остаётся — иначе некому добавить первого игрока
  });

  it("должен открыть не текущий турнир по ссылке", async () => {
    // турнир 3 «ДЗР-Д» — тип «Рейтинг», не текущий
    const res = await fetch(`${base}t/3`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /ДЗР-Д/);
    // в переключателе выбран просматриваемый турнир, а не текущий
    assert.match(html, /<option value="3" selected/);
  });

  it("должен открыть турнир типа 110 по ссылке", async () => {
    // турнир 2 «110-1» — тип «110»
    const res = await fetch(`${base}t/2`);

    assert.strictEqual(res.status, 200);
  });

  it("должен отдать 404 для неизвестного турнира", async () => {
    const res = await fetch(`${base}t/999`);
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

  it("должен показывать среднее время одного очка в формате «Nм Nс»", async () => {
    await clean();
    const ids = await seedUsers();

    // матч A (текущий турнир): игры в 10:20:00 и 10:59:59 → длительность
    // с начала матча (10:00:00) 3599 с (в пределах констрейнта часа);
    // очки 21:5 (26) + 21:10 (31) = 57 → 3599/57 ≈ 63.1 с/очко → «1м 3с»
    await matchService.create(...(ids as [number, number, number, number]));
    const a = (await matchService.getAll() as { id: number }[]).at(-1)!.id;
    await gameService.create(a, null, "5", "2026-01-01 10:20:00");
    await gameService.create(a, null, "10", "2026-01-01 10:59:59");
    // матч B (другой турнир): длительность 600 с, очки 31 + 31 = 62
    // → за всё время среднее {63.1, 9.7} = 36.4 → «36с»
    await matchService.create(...(ids as [number, number, number, number]));
    const b = (await matchService.getAll() as { id: number }[]).at(-1)!.id;
    await gameService.create(b, null, "10", "2026-01-01 12:05:00");
    await gameService.create(b, null, "10", "2026-01-01 12:10:00");

    db.exec(`UPDATE match SET created_at = '2026-01-01 10:00:00' WHERE id = ${a}`);
    db.exec(`UPDATE match SET created_at = '2026-01-01 12:00:00', tournament_id = 1 WHERE id = ${b}`);

    const res = await fetch(`${base}t/4`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    // блок «Статистика» после блока «Достижения»: таблица (Параметр | Турнир | За всё время)
    assert.match(html, /<h1[^>]*>Статистика<\/h1>/);
    assert.match(html, /<th[^>]*>Параметр<\/th>\s*<th[^>]*>Турнир<\/th>\s*<th[^>]*>За всё время<\/th>/);
    // среднее секунд на очко: текущий — 3599/57 ≈ 63.1 → 63 → «1м 3с»;
    // за всё время — среднее {63.1, 9.7} = 36.4 → «36с»
    assert.match(html, /<td[^>]*><math>\s*<mover accent="true">\s*<mi>t<\/mi>\s*<mo>‾<\/mo>\s*<\/mover>\s*<\/math>\s*розыгрыша<\/td>\s*<td[^>]*>\s*1м 3с\s*<\/td>\s*<td[^>]*>\s*36с\s*<\/td>/);
    // среднее времени игры: текущий — {1200, 2399} → 1799.5 с → «30м»;
    // за всё время — {300, 300, 1200, 2399} → 1049.75 с → «17м 30с»
    assert.match(html, /<td[^>]*>\s*<math>\s*<mover accent="true">\s*<mi>t<\/mi>\s*<mo>‾<\/mo>\s*<\/mover>\s*<\/math>\s*<math>\s*<msub>\s*<mi>\s*игры\s*<\/mi>\s*<mi>666<\/mi>\s*<\/msub>\s*<\/math>(?:\s*<\/msub>)?\s*<\/td>\s*<td[^>]*>\s*30м 0с\s*<\/td>\s*<td[^>]*>\s*17м 30с\s*<\/td>/);
    // среднее времени матча: текущий — 3599 с → «59м 59с»;
    // за всё время — {600, 3599} → 2099.5 с → «35м 0с»
    assert.match(html, /<td[^>]*><math>\s*<mover accent="true">\s*<mi>матч<\/mi>\s*<mo>‾<\/mo>\s*<\/mover>\s*<\/math>\s*<\/td>\s*<td[^>]*>\s*59м 59с\s*<\/td>\s*<td[^>]*>\s*35м 0с\s*<\/td>/);
    // игр в матче (2-3): по 2 игры в каждом матче → «2»; лейбл с диапазоном wins..2×wins−1
    assert.match(html, /<td[^>]*>\s*Игр в матче \(2-3\)\s*<\/td>\s*<td[^>]*>\s*2\s*<\/td>\s*<td[^>]*>\s*2\s*<\/td>/);
    // порядок строк блока: города → участники → средний рейтинг → новички, % → игры → матчи;
    // формат новичков — «NN%(N)»: процент (новичков)
    assert.match(html, /<td[^>]*>\s*Городов\s*<\/td>[\s\S]*?<td[^>]*>\s*Участников\s*<\/td>[\s\S]*?<td[^>]*>\s*Средний рейтинг\s*<\/td>[\s\S]*?<td[^>]*>\s*Новичков, %\s*<\/td>\s*<td[^>]*>\s*\d+%\(\d+\)\s*<\/td>\s*<td[^>]*>\s*\d+%\(\d+\)\s*<\/td>[\s\S]*?<td[^>]*>\s*Игр\s*<\/td>[\s\S]*?<td[^>]*>\s*Матчей\s*<\/td>/);
    // строки-новинки присутствуют
    for (const label of ['Городов', 'Участников', 'Средний рейтинг', 'Игр', 'Матчей',
      'max(t) игры', 'max(t) матча',
      'Дельта рейтинга: топ прироста', 'Дельта рейтинга: топ падения',
      'Топ винрейта',
      'Как быстро набивается capacity по типам турниров']) {
      assert.match(html, new RegExp(`<td[^>]*>${label.replace(/[()]/g, '\\$&').replace(/ /g, '\\s+')}<`));
    }
    // «Повторные пары» убраны из блока
    assert.doesNotMatch(html, /Повторные пары/);
    assert.ok(html.indexOf('id="achievement"') < html.indexOf('id="stats"'));
    // «Статистика» — последний блок страницы: после админских блоков («Архив» последний из них)
    assert.ok(html.indexOf('id="player-archive"') < html.indexOf('id="stats"'));
  });

  it("должен показывать прочерк без подходящих матчей", async () => {
    await clean();
    const res = await fetch(`${base}t/4`);
    const html = await res.text();

    assert.match(html, /<td[^>]*><math>\s*<mover accent="true">\s*<mi>t<\/mi>\s*<mo>‾<\/mo>\s*<\/mover>\s*<\/math>\s*розыгрыша<\/td>\s*<td[^>]*>\s*—\s*<\/td>\s*<td[^>]*>\s*—\s*<\/td>/);
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
    const res = await fetch(`${guestBase}t/4`);
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

    const res = await fetch(`${base}t/4`);
    const html = await res.text();

    // список сверху вниз: новейший (b) первым с номером №2, старейший (a) — №1
    const numbers = [...html.matchAll(/match-history-info[^>]*>№(\d+) \((\d+)\)/g)]
      .map((m) => [Number(m[1]), Number(m[2])]);
    assert.deepStrictEqual(numbers, [[2, b], [1, a]]);
  });
});
