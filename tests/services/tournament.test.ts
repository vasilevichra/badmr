import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import TournamentService from "../../src/services/tournament.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

interface TournamentRow {
  id: number;
  name: string;
  city: string;
  city_id: number;
  current: number;
  tournament_status_id: number;
  unit_id: number;
}

const tournamentService = new TournamentService();
const userService = new UserService();
const db = new Repository().db;

// в тестовой БД после миграций текущий турнир id=4 ('Новая Лига', статус 'Регистрация');
// турнир 1 ('Рейтинг', статус 'Идёт') имеет завершённые матчи и 14 неархивированных участников;
// у турнира 4 девять неархивированных участников, двое из них оплатили взнос
const unarchivedCount = { current: 9, first: 14 };

describe("Tournament", () => {
  beforeEach(async () => {
    await clean();
  });

  it("повторное создание сервиса должно вернуть существующий singleton", () => {
    assert.strictEqual(new TournamentService(), tournamentService);
  });

  describe("getCurrent", () => {
    it("должен вернуть текущий турнир", async () => {
      const current = await tournamentService.getCurrent() as TournamentRow;

      assert.strictEqual(current.id, 4);
      assert.strictEqual(current.name, "Новая Лига");
      assert.strictEqual(current.city_id, 1);
      assert.strictEqual(current.tournament_status_id, 1);
    });
  });

  describe("setCurrent", () => {
    it("должен сделать турнир текущим, сбросив остальные", async () => {
      await tournamentService.setCurrent(1);

      assert.strictEqual((await tournamentService.getById(1) as TournamentRow).current, 1);
      assert.strictEqual((await tournamentService.getById(4) as TournamentRow).current, 0);
      assert.strictEqual((await tournamentService.getCurrent() as TournamentRow).id, 1);
    });
  });

  describe("getAll", () => {
    it("должен вернуть все турниры от новых к старым", async () => {
      const all = await tournamentService.getAll() as TournamentRow[];

      assert.strictEqual(all.length, 4);
      assert.deepStrictEqual(
        all.map((t) => ({ id: t.id, name: t.name, city: t.city })),
        [
          { id: 4, name: "Новая Лига", city: "Доброград" },
          { id: 3, name: "ДЗР-Д", city: "Дзержинск" },
          { id: 2, name: "110-1", city: "Доброград" },
          { id: 1, name: "Рейтинг", city: "Доброград" },
        ],
      );
    });
  });

  describe("getById", () => {
    it("должен вернуть турнир по id", async () => {
      const tournament = await tournamentService.getById(4) as TournamentRow;

      assert.strictEqual(tournament.name, "Новая Лига");
      assert.strictEqual(tournament.current, 1);
      assert.strictEqual(tournament.tournament_status_id, 1);
    });

    it("должен вернуть пустой ответ для несуществующего турнира", async () => {
      assert.strictEqual(await tournamentService.getById(999), undefined);
    });
  });

  describe("setStatus", () => {
    it("должен изменить статус указанного турнира", async () => {
      await tournamentService.setStatus(3, 1);

      assert.strictEqual((await tournamentService.getById(1) as TournamentRow).tournament_status_id, 3);
    });

    it("должен изменить статус текущего турнира без указания id", async () => {
      await tournamentService.setStatus(4);

      assert.strictEqual((await tournamentService.getById(4) as TournamentRow).tournament_status_id, 4);
    });
  });

  describe("setLostStatuses", () => {
    it("должен завершить турниры с прошедшей датой окончания", async () => {
      await tournamentService.setLostStatuses();

      // турнир 4: статус 'Регистрация', дата окончания в прошлом -> 'Завершён'
      assert.strictEqual((await tournamentService.getById(4) as TournamentRow).tournament_status_id, 3);
      // турнир 1: дата окончания в будущем, но регистрация уже прошла -> 'Идёт'
      assert.strictEqual((await tournamentService.getById(1) as TournamentRow).tournament_status_id, 2);
      // турниры 2 и 3 уже завершены -> не меняются
      assert.strictEqual((await tournamentService.getById(2) as TournamentRow).tournament_status_id, 3);
    });

    it("должен перевести турниры с прошедшей регистрацией в статус 'Идёт'", async () => {
      const id = await tournamentService.create(
        1, 1, 1, 1, "Тест",
        "2026-01-01 10:00:00", "2026-01-02 10:00:00", "2027-01-03 10:00:00",
        20, 1, "100", "750", "", 0,
      );

      await tournamentService.setLostStatuses();

      assert.strictEqual((await tournamentService.getById(id) as TournamentRow).tournament_status_id, 2);
    });
  });

  describe("create", () => {
    it("должен создать текущий турнир с кортами и настройками рейтинга", async () => {
      const id = await tournamentService.create(
        1, 1, 1, 1, "Тестовый турнир",
        "2026-01-01 10:00:00", "2026-01-02 10:00:00", "2027-01-03 10:00:00",
        25, 2, "200", "600", "<a>Правила</a>", 1,
      );

      const created = await tournamentService.getById(id) as TournamentRow;
      assert.strictEqual(created.name, "Тестовый турнир");
      assert.strictEqual(created.current, 1);
      assert.strictEqual(created.tournament_status_id, 1);
      assert.strictEqual(created.unit_id, 1);
      assert.strictEqual(created.rules, "<a>Правила</a>");

      // прежний текущий турнир должен перестать быть текущим
      assert.strictEqual((await tournamentService.getById(4) as TournamentRow).current, 0);

      // должны быть созданы 2 корта
      const courts = await db.get<{ count: number }>(
        `SELECT count(*) AS count FROM court WHERE tournament_id = ?`, [id],
      );
      assert.strictEqual(courts?.count, 2);

      // должны быть установлены настройки рейтинга
      const settings = await db.all<{ name: string; value: string }>(
        `SELECT d.name AS name, s.value AS value
         FROM tournament_settings s
                  JOIN defaults d ON d.id = s.defaults_id
         WHERE s.tournament_id = ? AND d.name IN ('r_min', 'r_max')`, [id],
      );
      assert.deepStrictEqual(settings, [
        { name: "r_max", value: "600" },
        { name: "r_min", value: "200" },
      ]);
    });

    it("должен создать не текущий турнир, не сбрасывая текущий", async () => {
      const id = await tournamentService.create(
        1, 1, 1, 1, "Тестовый турнир",
        "2026-01-01 10:00:00", "2026-01-02 10:00:00", "2027-01-03 10:00:00",
        20, 1, "100", "750", "", 0,
      );

      assert.strictEqual((await tournamentService.getById(id) as TournamentRow).current, 0);
      assert.strictEqual((await tournamentService.getById(4) as TournamentRow).current, 1);
      assert.strictEqual((await tournamentService.getCurrent() as TournamentRow).id, 4);
    });
  });

  describe("isEveryonePaid", () => {
    it("должен вернуть 0, когда есть неоплатившие участники текущего турнира", async () => {
      assert.strictEqual(await tournamentService.isEveryonePaid(), 0);
    });

    it("должен вернуть 0 для турнира с неоплатившими участниками", async () => {
      assert.strictEqual(await tournamentService.isEveryonePaid(1), 0);
    });

    it("должен вернуть 1, когда все участники оплатили", async () => {
      const tournamentId = await tournamentService.create(
        1, 1, 1, 1, "Тестовый турнир",
        "2026-01-01 10:00:00", "2026-01-02 10:00:00", "2027-01-03 10:00:00",
        20, 1, "100", "750", "", 1,
      );
      const { id } = await userService.create("Тестов", "Алексей", "Отчество", 500, 1, 1, "1990-01-01");
      await userService.registerByIds([id]);

      assert.strictEqual(await tournamentService.isEveryonePaid(), 0);

      await tournamentService.pay(id);

      assert.strictEqual(await tournamentService.isEveryonePaid(), 1);
      assert.strictEqual(await tournamentService.isEveryonePaid(tournamentId), 1);
    });

    it("должен вернуть 1 для турнира без участников", async () => {
      const tournamentId = await tournamentService.create(
        1, 1, 1, 1, "Тестовый турнир",
        "2026-01-01 10:00:00", "2026-01-02 10:00:00", "2027-01-03 10:00:00",
        20, 1, "100", "750", "", 0,
      );

      assert.strictEqual(await tournamentService.isEveryonePaid(tournamentId), 1);
    });
  });

  describe("pay", () => {
    it("должен пометить участника оплатившим по умолчанию", async () => {
      const { id } = await userService.create("Тестов", "Алексей", "Отчество", 500, 1, 1, "1990-01-01");
      await userService.registerByIds([id]);

      await tournamentService.pay(id);

      const paid = await db.get<{ paid: number }>(
        `SELECT paid FROM tournament_user WHERE user_id = ?`, [id],
      );
      assert.strictEqual(paid?.paid, 1);
    });

    it("должен снять оплату при paid = 0", async () => {
      const { id } = await userService.create("Тестов", "Алексей", "Отчество", 500, 1, 1, "1990-01-01");
      await userService.registerByIds([id]);

      await tournamentService.pay(id, 1);
      await tournamentService.pay(id, 0);

      const paid = await db.get<{ paid: number }>(
        `SELECT paid FROM tournament_user WHERE user_id = ?`, [id],
      );
      assert.strictEqual(paid?.paid, 0);
    });
  });

  describe("hasGames", () => {
    it("должен вернуть 0, когда у текущего турнира нет завершённых матчей", async () => {
      assert.strictEqual(await tournamentService.hasGames(), 0);
    });

    it("должен вернуть 1 для турнира с завершёнными матчами", async () => {
      // сеем матч сами: дамп 05-specific перегенерируется из живой базы,
      // рассчитывать на его матчи нельзя; finished=1 вставляется напрямую —
      // триггер расчёта рейтинга вешается только на UPDATE
      const db = new DatabaseSync(path.resolve(import.meta.dirname, "../../.data/test.db"), {enableForeignKeyConstraints: false});
      db.exec(`
        INSERT INTO match (id, tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id, finished)
        VALUES (900001, 1, 1, 2, 3, 4, 1, 1);
        INSERT INTO game (id, match_id, created_at, lost_1_by)
        VALUES (900001, 900001, '2026-01-01 10:00:00', 15);
      `);

      assert.strictEqual(await tournamentService.hasGames(1), 1);
    });

    it("должен вернуть 0 для турнира без матчей", async () => {
      assert.strictEqual(await tournamentService.hasGames(2), 0);
    });
  });

  describe("registeredCount", () => {
    it("должен вернуть количество участников текущего турнира", async () => {
      assert.strictEqual(await tournamentService.registeredCount(), unarchivedCount.current);
    });

    it("должен вернуть количество участников указанного турнира без архивных", async () => {
      assert.strictEqual(await tournamentService.registeredCount(1), unarchivedCount.first);
    });

    it("должен вернуть 0 для турнира без участников", async () => {
      assert.strictEqual(await tournamentService.registeredCount(999), 0);
    });
  });

  describe("create", () => {
    it("должен вернуть undefined и не оставить кортов при ошибке создания", async () => {
      // user_id NOT NULL — вставка турнира падает, catch удаляет корты
      const id = await tournamentService.create(
        null as unknown as number, 1, 1, 1, "Откат", "2026-01-01", "2026-01-02", "2026-01-03",
        10, 3, "100", "500", "", 0,
      );

      assert.strictEqual(id, undefined);
      assert.deepStrictEqual(db.all("SELECT id FROM tournament WHERE name = 'Откат'"), []);
      assert.deepStrictEqual(db.all("SELECT id FROM court WHERE tournament_id > 4"), []);
    });
  });

  describe("setDeferredStatusHandlers", () => {
    it("должен перевести статусы турниров по времени окончания", async () => {
      // статус 2 ('Идёт') → по ended_at переводится в 3 ('Завершён')
      db.run(
        `INSERT INTO tournament (user_id, user_club_id, gym_id, unit_id, tournament_type_id,
                                 tournament_status_id, name, current, reg_ended_at, started_at, ended_at)
         VALUES (1, 1, 1, 1, 1, 2, 'Идёт', 0,
                 datetime('now', '-1 day'), datetime('now', '-1 day'), datetime('now', '+1 second'))`,
      );
      // статус 1 ('Регистрация') → по reg_ended_at переводится в 2 ('Идёт')
      db.run(
        `INSERT INTO tournament (user_id, user_club_id, gym_id, unit_id, tournament_type_id,
                                 tournament_status_id, name, current, reg_ended_at, started_at, ended_at)
         VALUES (1, 1, 1, 1, 1, 1, 'Регистрация', 0,
                 datetime('now', '+1 second'), datetime('now', '+1 day'), datetime('now', '+2 days'))`,
      );

      tournamentService.setDeferredStatusHandlers();

      // задачи назначены на секунду вперёд — ждём с запасом
      await new Promise((resolve) => setTimeout(resolve, 1800));

      assert.strictEqual(
        db.get<{ s: number }>("SELECT tournament_status_id AS s FROM tournament WHERE name = 'Идёт'")!.s,
        3,
      );
      assert.strictEqual(
        db.get<{ s: number }>("SELECT tournament_status_id AS s FROM tournament WHERE name = 'Регистрация'")!.s,
        2,
      );
    });
  });
});
