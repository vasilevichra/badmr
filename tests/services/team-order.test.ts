import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import TeamOrderRepository from "../../src/repositories/team-order.ts";
import TeamOrderService from "../../src/services/team-order.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const teamOrderRepository = new TeamOrderRepository();
const teamOrderService = new TeamOrderService();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

/** Мужские (1) и женские (0) позиции состава: круг 1 — 1-8, круг 2 — 9-16. */
const malePositions = [1, 3, 4, 7, 9, 11, 12, 15];
const femalePositions = [2, 5, 6, 8, 10, 13, 14, 16];

interface PlayerSpec {
  sex: number;
  rating1?: number | null;
  rating2?: number | null;
}

/** Команда в текущем турнире (4) с игроками; возвращает id команды
 *  и id team_user в порядке перечисления игроков.
 *
 *  team_color_id уникален на вызов: UNIQUE(tournament_id, group_id,
 *  team_color_id), а clean() снимает только фикстурные команды —
 *  созданные тестом строки переживают сброс. */
let seedColorSeq = 900;
const seedTeam = async (players: PlayerSpec[]) => {
  const team = teamService.create(4, 5, `Тестовая ${++seedColorSeq}`, 1, seedColorSeq)!;
  const teamUserIds: number[] = [];
  for (const [i, p] of players.entries()) {
    const user = await userService.create(`Игрок${i}`, "Тест", "", 500, p.sex, 1, "1990-01-01");
    const tu = teamUserService.create(team.id, user.id, 5)!;
    teamUserIds.push(tu.id);
    if (p.rating1 !== undefined || p.rating2 !== undefined) {
      db.run("INSERT INTO user_lab (user_id, rating_1, rating_2) VALUES (?, ?, ?)",
          [user.id, p.rating1 ?? null, p.rating2 ?? null]);
    }
  }
  return { team: team.id, teamUserIds };
};

describe("TeamOrder", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("positionNumberToName", () => {
    it("должен маппить все 16 номеров в имена колонок", () => {
      const expected = [
        "ms1", "ws1", "md11", "md12", "wd11", "wd12", "xd11", "xd12",
        "ms2", "ws2", "md21", "md22", "wd21", "wd22", "xd21", "xd22",
      ];
      expected.forEach((name, i) => {
        assert.strictEqual(teamOrderRepository.positionNumberToName(i + 1), name);
      });
    });

    it("должен бросить ошибку для номера вне диапазона 1-16", () => {
      assert.throws(() => teamOrderRepository.positionNumberToName(0), /Bad position number/);
      assert.throws(() => teamOrderRepository.positionNumberToName(17), /Bad position number/);
    });
  });

  describe("positionNumberToSex", () => {
    it("должен вернуть 1 для мужских слотов и 0 для женских", () => {
      malePositions.forEach(n => assert.strictEqual(teamOrderRepository.positionNumberToSex(n), 1, `позиция ${n}`));
      femalePositions.forEach(n => assert.strictEqual(teamOrderRepository.positionNumberToSex(n), 0, `позиция ${n}`));
    });

    it("должен бросить ошибку для номера вне диапазона 1-16", () => {
      assert.throws(() => teamOrderRepository.positionNumberToSex(0), /Bad position number/);
      assert.throws(() => teamOrderRepository.positionNumberToSex(17), /Bad position number/);
    });
  });

  describe("set", () => {
    it("должен вставить состав и обновить слот без дублирования строки", async () => {
      const { team, teamUserIds } = await seedTeam([{sex: 1}, {sex: 0}]);

      teamOrderService.set(team, 1, teamUserIds[0]);

      let row = db.get<{ ms1: number }>("SELECT ms1 FROM team_order_110 WHERE team_id = ?", [team])!;
      assert.strictEqual(row.ms1, teamUserIds[0]);

      // тот же слот другим игроком — UPSERT, строка по-прежнему одна
      teamOrderService.set(team, 1, teamUserIds[1]);

      const rows = db.all<{ ms1: number }>("SELECT ms1 FROM team_order_110 WHERE team_id = ?", [team]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].ms1, teamUserIds[1]);
    });

    it("должен заполнить слоты круга 1 и круга 2 отдельными колонками", async () => {
      const { team, teamUserIds } = await seedTeam([{sex: 1}, {sex: 1}]);

      teamOrderService.set(team, 1, teamUserIds[0]);
      teamOrderService.set(team, 9, teamUserIds[1]);

      const row = db.get<{ ms1: number; ms2: number }>("SELECT ms1, ms2 FROM team_order_110 WHERE team_id = ?", [team])!;
      assert.strictEqual(row.ms1, teamUserIds[0]);
      assert.strictEqual(row.ms2, teamUserIds[1]);
    });

    it("должен нарушить CHECK ms1 != ms2 при том же игроке в моно-слотах", async () => {
      const { team, teamUserIds } = await seedTeam([{sex: 1}]);

      teamOrderService.set(team, 1, teamUserIds[0]);
      assert.throws(() => teamOrderService.set(team, 9, teamUserIds[0]));
    });

    it("должен нарушить CHECK для партнёров пары (md11 = md12)", async () => {
      const { team, teamUserIds } = await seedTeam([{sex: 1}]);

      teamOrderService.set(team, 3, teamUserIds[0]);
      assert.throws(() => teamOrderService.set(team, 4, teamUserIds[0]));
    });

    it("должен нарушить CHECK ws1 = ws2", async () => {
      const { team, teamUserIds } = await seedTeam([{sex: 0}]);

      teamOrderService.set(team, 2, teamUserIds[0]);
      assert.throws(() => teamOrderService.set(team, 10, teamUserIds[0]));
    });
  });

  describe("roster", () => {
    it("должен вернуть состав с полом и средним рейтингом лаба", async () => {
      const { team } = await seedTeam([
        {sex: 1, rating1: 300, rating2: 400},  // среднее 350
        {sex: 0, rating1: 100, rating2: null}, // только одиночный: 100
      ]);

      const roster = teamOrderService.roster(team);

      assert.strictEqual(roster.length, 2);
      const m = roster.find(p => p.sex === 1)!;
      const f = roster.find(p => p.sex === 0)!;
      assert.strictEqual(m.rating, 350);
      assert.strictEqual(f.rating, 100);
      assert.match(m.name, /^Игрок0 Тест$/);
    });

    it("должен считать игрока без записей лаба самым слабым (рейтинг 0)", async () => {
      const { team } = await seedTeam([{sex: 1}]);

      const roster = teamOrderService.roster(team);

      assert.strictEqual(roster.length, 1);
      assert.strictEqual(roster[0].rating, 0);
    });

    it("должен вернуть пустой список для команды без игроков", () => {
      const team = teamService.create(4, 5, "Пустая", 1, 890)!;

      assert.deepStrictEqual(teamOrderService.roster(team.id), []);
    });
  });

  describe("select", () => {
    it("должен вернуть игроков команды только пола позиции", async () => {
      const { team } = await seedTeam([{sex: 1}, {sex: 1}, {sex: 0}]);

      const men = teamOrderService.select(team, 1);   // ms1 — мужской слот
      const women = teamOrderService.select(team, 2); // ws1 — женский

      assert.strictEqual(men.length, 2);
      assert.ok(men.every(p => p.sex === 1));
      assert.strictEqual(women.length, 1);
      assert.ok(women.every(p => p.sex === 0));
    });

    it("должен вернуть пустой список, если игроков нужного пола нет", async () => {
      const { team } = await seedTeam([{sex: 1}]);

      assert.deepStrictEqual(teamOrderService.select(team, 2), []);
    });
  });

  describe("position", () => {
    it("должен вернуть игрока в слоте", async () => {
      const { team, teamUserIds } = await seedTeam([{sex: 1}]);

      teamOrderService.set(team, 1, teamUserIds[0]);

      const player = teamOrderService.position(team, 1)!;
      assert.strictEqual(player.id, teamUserIds[0]);
      assert.match(player.name, /^Игрок0 Тест$/);
      assert.strictEqual(player.sex, 1);
    });

    it("должен вернуть undefined для пустого слота", async () => {
      const { team } = await seedTeam([{sex: 1}]);

      assert.strictEqual(teamOrderService.position(team, 1), undefined);
    });
  });
});
