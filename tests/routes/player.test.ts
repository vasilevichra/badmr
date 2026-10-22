import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { testDbPath } from "../../src/test-db.ts";
import PlayerRouter from "../../src/routes/web/player.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import UserService from "../../src/services/user.ts";
import SettingsService from "../../src/services/settings.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import { clean } from "../helpers/migration.ts";
import type { AddressInfo } from "node:net";

const app: App = Express();
app.set("views", path.resolve(import.meta.dirname, "../../src/public/views"));
app.set("view engine", "ejs");
app.use(promiseMiddleware());
app.use((req, _res, next) => {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: number } }).user = { id: 1 };
  next();
});
app.use("/web/players", PlayerRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/web/players`;

const userService = new UserService();
const matchService = new MatchService();
const gameService = new GameService();

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Игрок в калибровке: сид 500, его пара выигрывает обе игры —
 *  после матча у игрока stale=1, series=1. */
const seedCalibratedPlayer = async () => {
  const ids: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const { id } = await userService.create(`Фамилия${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
    ids.push(id);
  }
  await userService.deregisterAll();
  await userService.registerByIds(ids);
  await matchService.create(ids[0], ids[1], ids[2], ids[3]);
  const matches = await matchService.getAll() as { id: number; finished: number }[];
  const match = matches.filter((m) => m.finished === 0).at(-1)!;
  await gameService.create(match.id, null, "15", "2026-01-01 10:00:00");
  await gameService.create(match.id, null, "17", "2026-01-01 10:05:00");
  return { id: ids[0], matchId: match.id };
};

describe("Player page", () => {
  beforeEach(async () => {
    await clean();
  });

  it("должен показать неудобных соперников с долей поражений", async () => {
    const ids: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const { id } = await userService.create(`Фамилия${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
      ids.push(id);
    }
    await userService.deregisterAll();
    await userService.registerByIds(ids);
    // пара 1 (ids 0,1) проигрывает обе игры — оба соперника с 100% поражений
    await matchService.create(ids[0], ids[1], ids[2], ids[3]);
    const matches = await matchService.getAll() as { id: number; finished: number }[];
    const match = matches.filter((m) => m.finished === 0).at(-1)!;
    await gameService.create(match.id, "15", null, "2026-01-01 10:00:00");
    await gameService.create(match.id, "17", null, "2026-01-01 10:05:00");

    const res = await fetch(`${base}/${ids[0]}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /Неудобные/);
    assert.match(html, /Фамилия3 Имя3/);
    assert.match(html, /Фамилия4 Имя4/);
    assert.match(html, /100\.00%/);
    // выигрывать не с кем — вкладка «Выигрывает» скрыта
    assert.doesNotMatch(html, /Выигрывает/);
    // проигрывал с напарником — вкладка «Проигрывает» показана
    assert.match(html, /Проигрывает/);
  });

  it("должен показывать нижнюю дельту с дробной частью", async () => {
    const ids: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const { id } = await userService.create(`Фамилия${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
      ids.push(id);
    }
    await userService.deregisterAll();
    await userService.registerByIds(ids);
    // равные рейтинги, калибровка выключена → дельта ровно 10:
    // верх «+10.0», низ был бы «+10» без дробной части
    const settingsService = new SettingsService();
    await settingsService.set("calibration_matches", "0");
    await matchService.create(ids[0], ids[1], ids[2], ids[3]);
    const matches = await matchService.getAll() as { id: number; finished: number }[];
    const match = matches.filter((m) => m.finished === 0).at(-1)!;
    await gameService.create(match.id, "15", null, "2026-01-01 10:00:00");
    await gameService.create(match.id, "15", null, "2026-01-01 10:05:00");

    const html = await (await fetch(`${base}/${ids[2]}`)).text();

    assert.match(html, /class="rating-[a-z]+">\+10\.0<\/td>/, "нижняя дельта без дробной части");
    assert.doesNotMatch(html, /class="rating-[a-z]+">\+10<\/td>/);
  });

  it("должен показать номинации пользователя в карточке достижений", async () => {
    const ids: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const { id } = await userService.create(`Фамилия${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
      ids.push(id);
    }
    await userService.deregisterAll();
    await userService.registerByIds(ids);
    const [u1, u2, u3, u4, u5, u6] = ids;
    const at = (offsetMinutes: number) =>
      new Date(Date.now() + offsetMinutes * 60000).toISOString().replace("T", " ").substring(0, 19);
    const seed = async (users: number[], games: [string | null, string | null, number][]) => {
      await matchService.create(...(users as [number, number, number, number]));
      const match = (await matchService.getAll() as { id: number }[]).at(-1)!;
      for (const [l1, l2, offset] of games) {
        await gameService.create(match.id, l1, l2, at(offset));
      }
    };

    await seed([u1, u2, u3, u4], [[null, "5", 10], [null, "25", 40]]);      // победа (u1,u2) 2:0
    await seed([u1, u2, u3, u4], [["5", null, 10], ["8", null, 25]]);       // победа (u3,u4) 2:0
    await seed([u1, u2, u3, u4], [[null, "3", 10], ["20", null, 30], ["20", null, 70]]); // (u3,u4) 2:1, по очкам выигрывает (u1,u2)

    const res = await fetch(`${base}/${u1}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /Достижения/);
    assert.match(html, /Пулемётчик/);
    assert.match(html, /Очень старался, но ничего не получилось/);
    assert.match(html, /Черепаха/);
  });

  it("не должен показывать карточку достижений без номинаций", async () => {
    const { id } = await userService.create("Фамилия", "Имя", "Отчество", 500, 1, 1, "1990-01-01");
    await userService.deregisterAll();
    await userService.registerByIds([id]);

    const res = await fetch(`${base}/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.doesNotMatch(html, /Достижения/);
  });

  it("не должен показать неудобных соперников когда их нет", async () => {
    const ids: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const { id } = await userService.create(`Фамилия${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
      ids.push(id);
    }
    await userService.deregisterAll();
    await userService.registerByIds(ids);
    // пара 1 (ids 0,1) выигрывает обе игры — соперники с 0% поражений
    await matchService.create(ids[0], ids[1], ids[2], ids[3]);
    const matches = await matchService.getAll() as { id: number; finished: number }[];
    const match = matches.filter((m) => m.finished === 0).at(-1)!;
    await gameService.create(match.id, null, "15", "2026-01-01 10:00:00");
    await gameService.create(match.id, null, "17", "2026-01-01 10:05:00");

    const res = await fetch(`${base}/${ids[0]}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.doesNotMatch(html, /Неудобные/);
    // имена соперников теперь легитимно видны во вкладке «Матчи» (история),
    // поэтому проверяем только скрытие статистических вкладок
    // проигрывать не с кем — вкладка «Проигрывает» скрыта
    assert.doesNotMatch(html, /Проигрывает/);
    // выигрывал с напарником — вкладка «Выигрывает» показана
    assert.match(html, /Выигрывает/);
  });

  it("должен показать историю матчей игрока на текущем турнире", async () => {
    const ids: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const { id } = await userService.create(`Фамилия${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
      ids.push(id);
    }
    await userService.deregisterAll();
    await userService.registerByIds(ids);
    const [u1, u2, u3, u4, u5, u6] = ids;
    const at = (offsetMinutes: number) =>
      new Date(Date.now() + offsetMinutes * 60000).toISOString().replace("T", " ").substring(0, 19);
    const seed = async (users: number[], games: [string | null, string | null, number][]) => {
      await matchService.create(...(users as [number, number, number, number]));
      const match = (await matchService.getAll() as { id: number }[]).at(-1)!;
      for (const [l1, l2, offset] of games) {
        await gameService.create(match.id, l1, l2, at(offset));
      }
    };

    // матчи игрока u1
    await seed([u1, u2, u3, u4], [[null, "15", 10], [null, "17", 40]]); // победа (u1,u2) 2:0
    await seed([u1, u2, u3, u4], [["15", null, 10], ["17", null, 40]]); // победа (u3,u4) 2:0
    // матч без участия u1 — не должен попасть в его историю
    await seed([u3, u4, u5, u6], [[null, "15", 10], [null, "17", 40]]);

    const res = await fetch(`${base}/${u1}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    // вкладка «Матчи» показана, история отрендерена таблицами match-history
    assert.match(html, /id="matches-tab"/);
    assert.match(html, /match-history-players/);
    // вкладка «Матчи» — вторая, сразу после «Обзор»
    assert.ok(html.indexOf('id="matches-tab"') < html.indexOf('id="win-tab"'));
    // победный матч: напарник в истории, дельта рейтинга положительная
    assert.match(html, /Фамилия2 Имя2/);
    assert.match(html, /rating-plus">\+\d+\.\d/);
    // матч без участия игрока в историю не попал
    assert.doesNotMatch(html, /Фамилия5 Имя5/);
  });

  it("должен скрыть все вкладки когда у игрока нет матчей", async () => {
    const { id } = await userService.create("Фамилия1", "Имя1", "Отчество", 500, 1, 1, "1990-01-01");
    await userService.deregisterAll();
    await userService.registerByIds([id]);

    const res = await fetch(`${base}/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.doesNotMatch(html, /Выигрывает/);
    assert.doesNotMatch(html, /Проигрывает/);
    assert.doesNotMatch(html, /Шанс/);
    assert.doesNotMatch(html, /Неудобные/);
    // истории матчей нет — вкладка скрыта
    assert.doesNotMatch(html, /id="matches-tab"/);
  });

  it("должен показать прогресс калибровки у игрока в серии", async () => {
    // дефолты миграций: C=3, boost=3, cap=20 — сид после первого матча в калибровке
    const { id } = await seedCalibratedPlayer();

    const res = await fetch(`${base}/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /Калибровка \(1 из 3\)/);
    assert.match(html, /aria-valuenow="33"/);
    // ширина полосы заполнения привязана к прогрессу серии
    assert.match(html, /class="progress-bar" role="progressbar" style="width: 33%"/);
  });

  it("должен показать калибровку сразу после добавления игрока на турнир", async () => {
    // сид без матчей: критерий калибровки выполнен, серия ещё не начата
    const { id } = await userService.create("Фамилия1", "Имя1", "Отчество", 500, 1, 1, "1990-01-01");
    await userService.deregisterAll();
    await userService.registerByIds([id]);

    const res = await fetch(`${base}/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /Калибровка \(0 из 3\)/);
    assert.match(html, /aria-valuenow="0"/);
  });

  it("должен показать калибровку у протухшего ветерана", async () => {
    // свежая строка stale=0, но матчу больше fresh_days — калибровка впереди
    const { id, matchId } = await seedCalibratedPlayer();
    const db = new DatabaseSync(testDbPath(), { enableForeignKeyConstraints: false });
    db.prepare("UPDATE rating SET stale = 0, series = 0 WHERE match_id = ?").run(matchId);
    db.prepare("UPDATE match SET created_at = datetime('now', '-70 days') WHERE id = ?").run(matchId);

    const res = await fetch(`${base}/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /Калибровка \(0 из 3\)/);
    assert.match(html, /aria-valuenow="0"/);
  });

  it("должен скрыть прогресс калибровки у свежего ветерана", async () => {
    // актуальный рейтинг (stale=0, дата свежая) — калибровка не нужна
    const { id, matchId } = await seedCalibratedPlayer();
    const db = new DatabaseSync(testDbPath(), { enableForeignKeyConstraints: false });
    db.prepare("UPDATE rating SET stale = 0, series = 0 WHERE match_id = ?").run(matchId);

    const res = await fetch(`${base}/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.doesNotMatch(html, /Калибровка/);
  });

  it("должен скрыть прогресс калибровки когда она выключена", async () => {
    const settingsService = new SettingsService();
    await settingsService.set("calibration_matches", "0");
    const { id } = await seedCalibratedPlayer();

    const res = await fetch(`${base}/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.doesNotMatch(html, /Калибровка/);
  });

  it("должен показать номер матча в серии по настройке calibration_matches", async () => {
    const settingsService = new SettingsService();
    await settingsService.set("calibration_matches", "2");
    const { id } = await seedCalibratedPlayer();

    const res = await fetch(`${base}/${id}`);
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.match(html, /Калибровка \(1 из 2\)/);
    assert.match(html, /aria-valuenow="50"/);
  });
});
