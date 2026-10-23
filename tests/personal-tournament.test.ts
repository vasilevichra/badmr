import assert from "node:assert/strict";
import { describe, before, after, it } from "node:test";
import Express, { type Express as App } from "express";
import promiseMiddleware from "../src/middleware/promise.ts";
import writeGuard from "../src/middleware/tournament-write-guard.ts";
import UserRouter from "../src/routes/user.ts";
import SettingsRouter from "../src/routes/settings.ts";
import TournamentRouter from "../src/routes/tournament.ts";
import Repository from "../src/repositories/common.ts";
import UserRepository from "../src/repositories/user.ts";
import CommonRepository from "../src/repositories/common.ts";
import SettingsRepository from "../src/repositories/settings.ts";
import CourtRepository from "../src/repositories/court.ts";
import UserService from "../src/services/user.ts";
import MatchService from "../src/services/match.ts";
import GameService from "../src/services/game.ts";
import TournamentService from "../src/services/tournament.ts";
import { clean } from "./helpers/migration.ts";
import type { AddressInfo } from "node:net";

/** Не-текущий турнир из сида: тип 1, available = 1, корты есть. */
const B = 3;

const userRepository = new UserRepository();
const commonRepository = new CommonRepository();
const settingsRepository = new SettingsRepository();
const courtRepository = new CourtRepository();
const userService = new UserService();
const matchService = new MatchService();
const gameService = new GameService();
const tournamentService = new TournamentService();
const db = new Repository().db;

interface PlayerRow {
  id: number;
  tournament_id: number;
}

interface ReadyRow {
  user_id: number;
  tournament_id: number;
}

const idsOf = (rows: unknown) => (rows as { id?: number; user_id?: number }[]).map((r) => r.id ?? r.user_id);

// мини-приложение: guard + читающие роутеры (анонимный доступ, как на проде)
const app: App = Express();
app.use(Express.json());
app.use(promiseMiddleware());
app.use(writeGuard);
app.use("/api/users", UserRouter);
app.use("/api/settings", SettingsRouter);
app.use("/api/tournaments", TournamentRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Личный просмотр турнира (?tournament=)", () => {
  const currentIds: number[] = [];
  const bIds: number[] = [];
  let archiveId = 0;
  let currentMatchId = 0;
  let bMatchId = 0;

  before(async () => {
    await clean();

    // четыре игрока, зарегистрированные на текущий турнир (id 4)
    for (let i = 0; i < 4; i++) {
      const { id } = await userService.create(`Игрок${i}`, `Текущий${i}`, "Отчество", 500, 1, 1, "1990-01-01");
      currentIds.push(id);
    }
    await userService.registerByIds(currentIds);

    // завершённый матч в текущем турнире: длительность 120с
    const created = await matchService.create(...(currentIds as [number, number, number, number]));
    currentMatchId = created.id ?? ((await matchService.getAll() as { id: number }[])[0].id);
    await gameService.create(currentMatchId, "15", null, "2026-01-01 10:01:00");
    await gameService.create(currentMatchId, "15", null, "2026-01-01 10:02:00");
    db.run(`UPDATE match SET created_at = '2026-01-01 10:00:00' WHERE id = ?`, [currentMatchId]);

    // четыре игрока, зарегистрированные только на турнир 3
    for (let i = 0; i < 4; i++) {
      const { id } = await userService.create(`Игрок${i}`, `Турнир3-${i}`, "Отчество", 500, 1, 1, "1990-01-01");
      bIds.push(id);
      db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived, paid) VALUES (?, ?, 1, 0, 1)`,
        [B, id]
      );
    }

    // завершённый матч в турнире 3: длительность 600с
    const courtId = (db.get(`SELECT id FROM court WHERE tournament_id = ? ORDER BY id LIMIT 1`, [B]) as { id: number }).id;
    bMatchId = db.run(
        `INSERT INTO match (tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id, finished, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, '2026-01-03 10:00:00')`,
        [B, bIds[0], bIds[1], bIds[2], bIds[3], courtId]
    ).id!;
    await gameService.create(bMatchId, "15", null, "2026-01-03 10:05:00");
    await gameService.create(bMatchId, "15", null, "2026-01-03 10:10:00");

    // игрок, который будет заархивирован (только в турнире 3)
    const { id: archivedUserId } = await userService.create(`Игрок0`, `Архив3`, "Отчество", 500, 1, 1, "1990-01-01");
    archiveId = archivedUserId;
    db.run(`INSERT INTO tournament_user (tournament_id, user_id, available, archived, paid) VALUES (?, ?, 1, 0, 1)`, [B, archiveId]);

    // override настроек для турнира 3 (game_point: дефолт '21' ≠ override)
    await settingsRepository.set("game_point", "11", B);
    const timezones = db.all<{ id: number; name: string }>(`SELECT id, name FROM timezone ORDER BY id`);
    await settingsRepository.set("timezone", String(timezones[timezones.length - 1].id), B);
    const states = db.all<{ id: number }>(`SELECT id FROM state ORDER BY id`);
    await settingsRepository.set("state", String(states[0].id), B);
    await settingsRepository.set("city", "2", B);
  });

  describe("view players / user.getAll", () => {
    it("с параметром возвращает игроков турнира 3", () => {
      const rows = userRepository.getAll(B) as PlayerRow[];
      // в сиде есть и другие регистрации в турнир 3 — проверяем
      // включение своих и принадлежность каждой строки турниру 3
      assert.ok(rows.every((r) => r.tournament_id === B));
      for (const id of bIds) assert.ok(idsOf(rows).includes(id));
      for (const id of currentIds) assert.ok(!idsOf(rows).includes(id));
    });

    it("без параметра возвращает игроков текущего турнира", () => {
      const rows = userRepository.getAll() as PlayerRow[];
      assert.ok(rows.every((r) => r.tournament_id !== B));
      for (const id of currentIds) assert.ok(idsOf(rows).includes(id));
      for (const id of bIds) assert.ok(!idsOf(rows).includes(id));
    });
  });

  describe("view ready / common.ready", () => {
    it("с параметром возвращает готовых игроков турнира 3", () => {
      const rows = commonRepository.ready([], B) as ReadyRow[];
      assert.ok(rows.every((r) => r.tournament_id === B));
      for (const id of bIds) assert.ok(idsOf(rows).includes(id));
      for (const id of currentIds) assert.ok(!idsOf(rows).includes(id));
    });

    it("без параметра возвращает готовых игроков текущего турнира", () => {
      const rows = commonRepository.ready([]) as ReadyRow[];
      for (const id of currentIds) assert.ok(idsOf(rows).includes(id));
      for (const id of bIds) assert.ok(!idsOf(rows).includes(id));
    });
  });

  describe("court.getAll", () => {
    it("с параметром возвращает корты турнира 3, без — текущего", () => {
      assert.deepEqual((courtRepository.getAll(B) as { number: number }[]).map((r) => r.number), [1, 2, 3, 4]);
      assert.deepEqual((courtRepository.getAll() as { number: number }[]).map((r) => r.number), [1, 2, 3]);
    });
  });

  describe("view archived / user.getArchived", () => {
    it("с параметром возвращает архив турнира 3", () => {
      // архивируем выделенного пользователя, чтобы не влиять на
      // роут-тесты, проверяющие наличие bIds в выборках
      db.run(`UPDATE tournament_user SET archived = 1 WHERE tournament_id = ? AND user_id = ?`, [B, archiveId]);
      const rows = userRepository.getArchived(B) as { id: number }[];
      assert.deepEqual(idsOf(rows), [archiveId]);

      const currentArchived = userRepository.getArchived() as { id: number }[];
      assert.ok(!idsOf(currentArchived).includes(archiveId));
    });
  });

  describe("match: медианы и история", () => {
    it("медианы с параметром считаются по турниру 3", () => {
      assert.strictEqual(matchService.getMedianMatchSecondsCurrent(B), 600);
      assert.strictEqual(matchService.getMedianMatchSecondsCurrent(), 120);
    });

    it("история последней сессии с параметром — матчи турнира 3", async () => {
      // история — массив групп {matchId: строки матча}
      const rows = await matchService.getAllFinishedAtLastSession(B) as Record<string, unknown>[];
      assert.strictEqual(rows.length, 1);
      assert.ok(Object.keys(rows[0]).includes(String(bMatchId)));

      const currentRows = await matchService.getAllFinishedAtLastSession() as Record<string, unknown>[];
      assert.ok(currentRows.length > 0);
      assert.ok(currentRows.every((m) => !Object.keys(m).includes(String(bMatchId))));
      assert.ok(currentRows.some((m) => Object.keys(m).includes(String(currentMatchId))));
    });
  });

  describe("settings", () => {
    it("get с параметром отдаёт override турнира 3", () => {
      assert.strictEqual(settingsRepository.get("game_point", B)?.value, "11");
      assert.strictEqual(settingsRepository.get("game_point")?.value, "21");
    });

    it("getSettings с параметром отдаёт настройки турнира 3", () => {
      assert.strictEqual(settingsRepository.getSettings(B).game_point, "11");
      assert.notStrictEqual(settingsRepository.getSettings().game_point, "11");
    });

    it("getTimezone с параметром отдаёт пояс турнира 3", () => {
      const tz = db.all<{ name: string }>(`SELECT name FROM timezone ORDER BY id`);
      assert.strictEqual(settingsRepository.getTimezone(B), tz[tz.length - 1].name);
    });

    it("cities с параметром помечает default по турниру 3", () => {
      assert.strictEqual((settingsRepository.cities(B) as { id: number; is_default: number }[]).find((s) => s.id === 2)?.is_default, 1);
      assert.strictEqual((settingsRepository.cities() as { id: number; is_default: number }[]).find((s) => s.id === 2)?.is_default, 0);
    });
  });

  describe("роуты", () => {
    it("GET /api/users/?tournament=3 — игроки турнира 3", async () => {
      const res = await fetch(`${base}/users/?tournament=${B}`);
      const rows = await res.json() as PlayerRow[];
      assert.ok(rows.every((r) => r.tournament_id === B));
      for (const id of bIds) assert.ok(idsOf(rows).includes(id));
    });

    it("GET /api/users/ — игроки текущего турнира", async () => {
      const res = await fetch(`${base}/users/`);
      const rows = await res.json() as PlayerRow[];
      for (const id of currentIds) assert.ok(idsOf(rows).includes(id));
      for (const id of bIds) assert.ok(!idsOf(rows).includes(id));
    });

    it("GET /api/users/?tournament=мусор — игроки текущего турнира", async () => {
      const res = await fetch(`${base}/users/?tournament=abc`);
      const rows = await res.json() as PlayerRow[];
      for (const id of bIds) assert.ok(!idsOf(rows).includes(id));
    });

    it("GET /api/settings/game_point?tournament=3 — override турнира 3", async () => {
      const res = await fetch(`${base}/settings/game_point?tournament=${B}`);
      assert.strictEqual(Number(await res.json()), 11);
    });

    it("GET /api/tournaments/registered/count?tournament=3 — регистрации турнира 3", async () => {
      const res = await fetch(`${base}/tournaments/registered/count?tournament=${B}`);
      assert.strictEqual(await res.json(), tournamentService.registeredCount(B));
      assert.notStrictEqual(await (await fetch(`${base}/tournaments/registered/count`)).json(), tournamentService.registeredCount(B));
    });

    it("write с ?tournament≠current — 409", async () => {
      const res = await fetch(`${base}/users/create?tournament=${B}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ln: "Тестов", fn: "Алексей", pn: "Отчество", rate: 500, sex: "on", city: 1, bd: "1990-01-01" }),
      });
      assert.strictEqual(res.status, 409);
    });

    it("write без ?tournament — проходит", async () => {
      const res = await fetch(`${base}/users/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ln: "Тестов", fn: "Алексей", pn: "Отчество", rate: 500, sex: "on", city: 1, bd: "1990-01-01" }),
      });
      assert.strictEqual(res.status, 200);
    });
  });
});
