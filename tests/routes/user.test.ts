import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import UserRouter from "../../src/routes/user.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import Repository from "../../src/repositories/common.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import { clean } from "../helpers/migration.ts";
import type { AddressInfo } from "node:net";

const app: App = Express();
app.use(Express.json());
app.use(promiseMiddleware());
app.use((req, _res, next) => {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: number } }).user = { id: 1 };
  next();
});
app.use("/api/users", UserRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users`;
const db = new Repository().db;
const matchService = new MatchService();
const gameService = new GameService();

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// создаёт пользователя через API и возвращает его id
const createUser = async (ln = "Тестов", fn = "Алексей"): Promise<number> => {
  const res = await fetch(`${base}/create`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ln, fn, pn: "Отчество", rate: 500, sex: "on", city: 1, bd: "1990-01-01"}),
  });
  return ((await res.json()) as { id: number }).id;
};

const post = async (path: string) => fetch(`${base}${path}`, {method: "POST"});

describe("User routes", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("POST /create, GET /:id", () => {
    it("должен создать пользователя и вернуть его по id", async () => {
      const id = await createUser();

      const res = await fetch(`${base}/${id}`);
      const user = await res.json() as { id: number; lastname: string; firstname: string; patronymic: string; sex: number; city_id: number };

      assert.strictEqual(user.id, id);
      assert.strictEqual(user.lastname, "Тестов");
      assert.strictEqual(user.firstname, "Алексей");
      assert.strictEqual(user.patronymic, "Отчество");
      assert.strictEqual(user.sex, 1);
      assert.strictEqual(user.city_id, 1);
    });
  });

  describe("GET /", () => {
    it("должен вернуть список игроков с созданным пользователем", async () => {
      const id = await createUser();
      await post(`/register/${id}`);

      const res = await fetch(`${base}/`);
      const users = await res.json() as { id: number }[];

      assert.ok(users.some((u) => u.id === id));
    });

    it("должен пометить calibrating игроков под критериями калибровки", async () => {
      const ids: number[] = [];
      for (let i = 1; i <= 4; i++) {
        ids.push(await createUser(`Фамилия${i}`, `Имя${i}`));
      }
      for (const id of ids) {
        await post(`/register/${id}`);
      }
      const [u1, u2, u3, u4] = ids;

      // пара (u1,u2) выигрывает обе игры
      await matchService.create(u1, u2, u3, u4);
      const matches = await matchService.getAll() as { id: number; finished: number }[];
      const match = matches.filter((m) => m.finished === 0).at(-1)!;
      await gameService.create(match.id, null, "15", "2026-01-01 10:00:00");
      await gameService.create(match.id, null, "17", "2026-01-01 10:05:00");

      const list = await (await fetch(`${base}/`)).json() as Record<string, number>[];
      const byId = (id: number) => list.find((u) => u.id === id)!;
      // игроки в серии калибровки (включая проигравших) — сиды до матча тоже
      assert.strictEqual(byId(u1).calibrating, 1);
      assert.strictEqual(byId(u3).calibrating, 1);
      // серия после первого матча — точка будет жёлтой
      assert.strictEqual(byId(u1).calibration_series, 1);
      assert.strictEqual(byId(u3).calibration_series, 1);

      // свежий актуальный рейтинг (stale=0) — калибровка не нужна
      db.exec(`UPDATE rating SET stale = 0, series = 0 WHERE match_id = ${match.id}`);
      const fresh = await (await fetch(`${base}/`)).json() as Record<string, number>[];
      assert.strictEqual(fresh.find((u) => u.id === u1)!.calibrating, 0);
      assert.strictEqual(fresh.find((u) => u.id === u1)!.calibration_series, 0);

      // протухший рейтинг: матчу больше calibration_days —
      // калибровка впереди, серия начнётся заново с нуля (красная точка)
      db.exec(`UPDATE match SET created_at = datetime('now', '-70 days') WHERE id = ${match.id}`);
      const stale = await (await fetch(`${base}/`)).json() as Record<string, number>[];
      assert.strictEqual(stale.find((u) => u.id === u1)!.calibrating, 1);
      assert.strictEqual(stale.find((u) => u.id === u3)!.calibrating, 1);
      assert.strictEqual(stale.find((u) => u.id === u1)!.calibration_series, 0);
    });
  });

  describe("GET /find", () => {
    it("должен найти пользователя по ФИО", async () => {
      const id = await createUser();

      const res = await fetch(`${base}/find?lastname=Тестов&firstname=Алексей&patronymic=Отчество`);
      const found = await res.json() as { id: number; city: string }[];

      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
      assert.strictEqual(found[0].city, "Доброград");
    });
  });

  describe("POST /register/:ids, GET /registered/:id, POST /deregister/:ids", () => {
    it("должен регистрировать и разрегистрировать пользователя", async () => {
      const id = await createUser();

      await post(`/register/${id}`);
      assert.deepStrictEqual(await (await fetch(`${base}/registered/${id}`)).json(), {registered: 1});

      await post(`/deregister/${id}`);
      assert.deepStrictEqual(await (await fetch(`${base}/registered/${id}`)).json(), {registered: 0});
    });
  });

  describe("POST /enable/:ids, POST /disable/:ids", () => {
    it("должен переключать доступность участника турнира", async () => {
      const id = await createUser();
      await post(`/register/${id}`);

      await post(`/disable/${id}`);
      assert.strictEqual(
        db.get<{ available: number }>(
          "SELECT available FROM tournament_user WHERE user_id = ?", [id],
        )!.available, 0,
      );

      await post(`/enable/${id}`);
      assert.strictEqual(
        db.get<{ available: number }>(
          "SELECT available FROM tournament_user WHERE user_id = ?", [id],
        )!.available, 1,
      );
    });
  });

  describe("GET /rating/:id, POST /rating/:id", () => {
    it("должен вернуть и обновить рейтинг", async () => {
      const id = await createUser();

      assert.deepStrictEqual(await (await fetch(`${base}/rating/${id}`)).json(), {rating: 500});

      await fetch(`${base}/rating/${id}?new=600`, {method: "POST"});
      assert.deepStrictEqual(await (await fetch(`${base}/rating/${id}`)).json(), {rating: 600});
    });
  });

  describe("GET /select/:city_id", () => {
    it("должен вернуть id и имя пользователей города", async () => {
      const id = await createUser();

      const res = await fetch(`${base}/select/1`);
      const {results} = await res.json() as { results: { id: number; text: string }[] };

      assert.ok(results.some((u) => u.id === id && u.text === "Тестов Алексей"));
    });
  });

  describe("POST /archive/:id, GET /archived, POST /unarchive/:id", () => {
    it("должен архивировать и разархивировать пользователя", async () => {
      const id = await createUser();
      await post(`/register/${id}`);

      await post(`/archive/${id}`);
      assert.ok(((await (await fetch(`${base}/archived`)).json()) as { id: number }[])
        .some((u) => u.id === id));

      await post(`/unarchive/${id}`);
      assert.ok(!((await (await fetch(`${base}/archived`)).json()) as { id: number }[])
        .some((u) => u.id === id));
    });
  });

  describe("GET /lab/search", () => {
    it("должен ответить 200 даже когда сайт ничего не нашёл", async () => {
      // мок заменяет fetch для labSearch; оригинальный сохраняем для своих запросов
      const realFetch = globalThis.fetch;
      const noRows = `<p class="no-found">По вашему запросу ничего не найдено</p>`;
      globalThis.fetch = (async () =>
        ({json: async () => ({html: noRows})}) as unknown as Response) as unknown as typeof fetch;

      try {
        const res = await realFetch(`${base}/lab/search?name=Иванов%20Иван&city=Доброград&user_id=1`);
        assert.strictEqual(res.status, 200);
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });

  describe("GET /buddies/:id", () => {
    it("должен вернуть винрейт совместных матчей напарника", async () => {
      const ids: number[] = [];
      for (const [ln, fn] of [["Тестов", "Алексей"], ["Тестов", "Борис"], ["Тестов", "Виктор"], ["Тестов", "Григорий"]]) {
        ids.push(await createUser(ln, fn));
      }
      // матч, в котором пара 1 (ids[0], ids[1]) проиграла обе игры
      await matchService.create(ids[0], ids[1], ids[2], ids[3]);
      const match = (await matchService.getAll() as { id: number }[])[0];
      await gameService.create(match.id, "15", null, "2026-01-01 10:00:00");
      await gameService.create(match.id, "17", null, "2026-01-01 10:05:00");

      const res = await fetch(`${base}/buddies/${ids[0]}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await res.json(), [{
        user_id: ids[1],
        user_name: "Тестов Борис",
        user_sex: 1,
        user_pic: null,
        win_rate: "0.00",
      }]);
    });

    it("должен вернуть пустой список для игрока без матчей", async () => {
      const id = await createUser();

      const res = await fetch(`${base}/buddies/${id}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await res.json(), []);
    });
  });

  describe("lab/search", () => {
    const originalFetch = globalThis.fetch;

    after(() => {
      globalThis.fetch = originalFetch;
    });

    it("должен найти игрока без указания города", async () => {
      // сайт отвечает JSON-объектом с разметкой в поле html; запросы
      // к тестируемому express-серверу идут в оригинальный fetch
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (!url.startsWith("https://badminton4u.ru")) {
          return originalFetch(input, init);
        }
        const html = url.includes("/ajax?search=rating")
          ? `<a href="/players/12345"><span>1</span><span><bdo></bdo></span><span><b>Иванов Иван</b></span><span>г. Доброград</span><span><dfn data-type="d">520</dfn></span><span>01.01.26</span></a>`
          : `<header><bdo></bdo><h1>Иванов Иван </h1><h2>@login</h2><dfn data-type="s">500</dfn><dfn data-type="d">520</dfn></header><section id="info"><p class="address">г. Доброград</p><p class="birth">1 января 1990</p></section>`;
        return {json: async () => ({html})} as unknown as Response;
      }) as unknown as typeof fetch;

      const res = await fetch(`${base}/lab/search?name=${encodeURIComponent("Иванов Иван Отчество")}`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      const player = text ? JSON.parse(text) as {id: number} : null;
      assert.strictEqual(player?.id, 12345);
    });
  });
});
