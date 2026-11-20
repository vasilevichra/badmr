import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import BracketService from "../../src/services/bracket.ts";
import MatchService from "../../src/services/match.ts";
import Game110 from "../../src/repositories/game110.ts";
import SettingsService from "../../src/services/settings.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const bracketService = new BracketService();
const matchService = new MatchService();
const settingsService = new SettingsService();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

interface SlotRow {
  id: number;
  team_1_id: number;
  team_2_id: number;
  stage: 'upper' | 'lower' | 'group' | null;
  round: number | null;
  pos: number | null;
  finished: 0 | 1;
}

const slotRows = (tournamentId = 4): SlotRow[] =>
  db.all<SlotRow>(
    `SELECT id, team_1_id, team_2_id, stage, round, pos, finished
     FROM match_110 WHERE tournament_id = ?
     ORDER BY stage, round, pos`,
    [tournamentId]
  );

// сеет n команд по 1 игроку в котёл A (группа 1) текущего турнира фикстура
// (4), сила команды убывает с номером: сила = рейтинг игрока из user_lab →
// сид k = k-я по силе команда. Турнир переводится в статус «Идёт» (2).
// Котлу A выставляется чистая олимпийка (org 1, residents 1) — группового
// этапа нет, generate сеет все команды по силе.
const seedTeams = async (n: number): Promise<Map<number, number>> => {
  db.run(`UPDATE tournament SET tournament_status_id = 2 WHERE id = 4`);
  const seedToTeam = new Map<number, number>();
  for (let k = 1; k <= n; k++) {
    const { id: userId } = await userService.create(`Сеянный${k}`, `Игрок${k}`, "Отчество", 500, 1, 1, "1990-01-01");
    db.run(`INSERT INTO user_lab (user_id, rating_1) VALUES (?, ?)`, [userId, 1000 - k * 10]);
    const { id: teamId } = teamService.create(4, 1, `Команда ${k}`, 1, ((k - 1) % 12) + 1);
    teamUserService.create(teamId, userId, 1);
    seedToTeam.set(k, teamId);
  }
  await settingsService.set('org_system.a', '1', 4);
  await settingsService.set('group_residents.a', '1', 4);
  return seedToTeam;
};

// завершает матч 110 счётом победителя team (через SQL: increase 110 очков
// не тестируется здесь — роутинг проверяем напрямую)
const finishMatch = (matchId: number, winnerTeamId: number): void => {
  db.run(
    `UPDATE game_110
     SET score_1 = CASE WHEN (SELECT team_1_id FROM match_110 WHERE id = game_110.match_110_id) = ? THEN 110 ELSE 5 END,
         score_2 = CASE WHEN (SELECT team_1_id FROM match_110 WHERE id = game_110.match_110_id) = ? THEN 5 ELSE 110 END
     WHERE match_110_id = ?`,
    [winnerTeamId, winnerTeamId, matchId]
  );
  db.run(`UPDATE match_110 SET finished = 1 WHERE id = ?`, [matchId]);
  bracketService.onMatchFinished(matchId);
};

const slotOf = (rows: SlotRow[], stage: string, round: number, pos: number): SlotRow =>
  rows.find(r => r.stage === stage && r.round === round && r.pos === pos)!;

describe("Bracket (сетка 110)", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("generate", () => {
    it("8 команд: 4 матча раунда 1 по сеянию, у каждого игра", async () => {
      const seedToTeam = await seedTeams(8);
      await bracketService.generate(4, 1);

      const rows = slotRows().filter(r => r.stage === 'upper' && r.round === 1);
      assert.strictEqual(rows.length, 4);
      // классическая раскладка 8: (1v8),(4v5),(2v7),(3v6)
      const expected = [[1, 8], [4, 5], [2, 7], [3, 6]];
      rows.forEach((row, i) => {
        assert.deepStrictEqual(
          [seedToTeam.get(expected[i][0]), seedToTeam.get(expected[i][1])].sort((a, b) => a! - b!),
          [row.team_1_id, row.team_2_id].sort((a, b) => a - b),
          `пара pos=${row.pos}`
        );
        const game = db.get(`SELECT id FROM game_110 WHERE match_110_id = ?`, [row.id]);
        assert.ok(game, `игра матча ${row.id}`);
      });
    });

    it("12 команд: bye-сиды 1-4 без матчей раунда 1, остальные — 4 матча", async () => {
      await seedTeams(12);
      await bracketService.generate(4, 1);

      const r1 = slotRows().filter(r => r.stage === 'upper' && r.round === 1);
      assert.strictEqual(r1.length, 4);
      const playing = new Set(r1.flatMap(r => [r.team_1_id, r.team_2_id]));
      assert.strictEqual(playing.size, 8);
    });

    it("повторная генерация отклоняется", async () => {
      await seedTeams(8);
      await bracketService.generate(4, 1);
      await assert.rejects(() => bracketService.generate(4, 1), /уже сгенерирована/);
    });

    it("не идущий турнир отклоняется", async () => {
      await assert.rejects(() => bracketService.generate(4, 1), /идущего турнира/);
    });

    it("круговая система (org 2) отклоняется", async () => {
      await seedTeams(8);
      await settingsService.set('org_system.a', '2', 4);
      await assert.rejects(() => bracketService.generate(4, 1), /круговая/);
    });
  });

  describe("роутинг по завершении матча", () => {
    it("после двух матчей R1 создан матч R2 из победителей; карман проигравших ждёт своих", async () => {
      const seedToTeam = await seedTeams(8);
      await bracketService.generate(4, 1);

      const r1 = slotRows().filter(r => r.stage === 'upper' && r.round === 1);
      const pos1 = slotOf(r1, 'upper', 1, 1); // сиды 1v8
      const pos2 = slotOf(r1, 'upper', 1, 2); // сиды 4v5
      finishMatch(pos1.id, pos1.team_1_id);   // побеждает сид 1
      finishMatch(pos2.id, pos2.team_2_id);   // побеждает сид 5

      const rows = slotRows();
      const r2 = slotOf(rows, 'upper', 2, 1);
      assert.deepStrictEqual(
        [r2.team_1_id, r2.team_2_id].sort((a, b) => a - b),
        [seedToTeam.get(1), seedToTeam.get(5)].sort((a, b) => a! - b!)
      );
      const game = db.get(`SELECT id FROM game_110 WHERE match_110_id = ?`, [r2.id]);
      assert.ok(game, "у созданного матча R2 есть игра");
      // карман проигравших R1 (пары pos1+pos4, pos2+pos3) ещё не готов
      assert.ok(!rows.some(r => r.stage === 'lower'));
    });

    it("полный раунд: после 4 матчей R1 созданы 2 матча R2 и 2 матча кармана", async () => {
      await seedTeams(8);
      await bracketService.generate(4, 1);

      for (const m of slotRows().filter(r => r.stage === 'upper' && r.round === 1)) {
        finishMatch(m.id, m.team_1_id);
      }

      const rows = slotRows();
      assert.strictEqual(rows.filter(r => r.stage === 'upper' && r.round === 2).length, 2);
      assert.strictEqual(rows.filter(r => r.stage === 'lower' && r.round === 1).length, 2);
    });

    it("полный раунд: в матчи кармана попадают проигравшие R1", async () => {
      const seedToTeam = await seedTeams(8);
      await bracketService.generate(4, 1);
      for (const m of slotRows().filter(r => r.stage === 'upper' && r.round === 1)) {
        finishMatch(m.id, m.team_1_id); // побеждает верхний сид пары
      }
      const seedsOf = (m: SlotRow) =>
          [m.team_1_id, m.team_2_id].map(t => [...seedToTeam.entries()].find(([, id]) => id === t)![0])
              .sort((a, b) => a - b);
      const lower = slotRows().filter(r => r.stage === 'lower' && r.round === 1)
          .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
      // пары кармана сеются по layout(4)=[1,4,2,3]: (U1p1,U1p4) и (U1p2,U1p3);
      // раскладка R1: (1,8),(4,5),(2,7),(3,6), team_1 (минимальный сид) побеждает
      // → проигравшие U1p1→8, U1p2→5, U1p3→7, U1p4→6
      assert.deepStrictEqual(seedsOf(lower[0]), [6, 8]);
      assert.deepStrictEqual(seedsOf(lower[1]), [5, 7]);
    });

    it("после завершения матчей кармана уровня 1 созданы матчи уровня 2", async () => {
      const seedToTeam = await seedTeams(8);
      await bracketService.generate(4, 1);
      // R1: побеждает team_1 (минимальный сид)
      for (const m of slotRows().filter(r => r.stage === 'upper' && r.round === 1)) {
        finishMatch(m.id, m.team_1_id);
      }
      // L1: побеждает team_1
      for (const m of slotRows().filter(r => r.stage === 'lower' && r.round === 1)) {
        finishMatch(m.id, m.team_1_id);
      }
      const seedsOf = (m: SlotRow) =>
          [m.team_1_id, m.team_2_id].map(t => [...seedToTeam.entries()].find(([, id]) => id === t)![0])
              .sort((a, b) => a - b);
      const l2 = slotRows().filter(r => r.stage === 'lower' && r.round === 2)
          .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
      assert.strictEqual(l2.length, 2);
      // подкарман победителей (места 5–6): победители L1p1 (сид 8) и L1p2 (сид 5)
      assert.deepStrictEqual(seedsOf(l2[0]), [5, 8]);
      // подкарман проигравших (места 7–8): проигравшие L1p1 (сид 6) и L1p2 (сид 7)
      assert.deepStrictEqual(seedsOf(l2[1]), [6, 7]);
    });

    it("после generate матчи с двумя bye-питателями созданы сразу (n=5: U2p2 = сиды 2,3)", async () => {
      const seedToTeam = await seedTeams(5);
      await bracketService.generate(4, 1);
      const seedsOf = (m: SlotRow) =>
          [m.team_1_id, m.team_2_id].map(t => [...seedToTeam.entries()].find(([, id]) => id === t)![0])
              .sort((a, b) => a - b);
      const r2 = slotRows().filter(r => r.stage === 'upper' && r.round === 2);
      // U2p1 (сид 1 v победитель (4,5)) ещё не создан; U2p2 (сид 2 v сид 3) — создан
      assert.strictEqual(r2.length, 1);
      assert.strictEqual(r2[0].pos, 2);
      assert.deepStrictEqual(seedsOf(r2[0]), [2, 3]);
      assert.strictEqual(r2[0].finished, 0);
    });

    it("bye-команда ждёт победителя реального матча: U2p1 создан после завершения R1 (n=5)", async () => {
      const seedToTeam = await seedTeams(5);
      await bracketService.generate(4, 1);
      const seedsOf = (m: SlotRow) =>
          [m.team_1_id, m.team_2_id].map(t => [...seedToTeam.entries()].find(([, id]) => id === t)![0])
              .sort((a, b) => a - b);

      const r1 = slotRows().filter(r => r.stage === 'upper' && r.round === 1);
      assert.deepStrictEqual(r1.map(r => r.pos), [2]); // единственный реальный матч: (4,5)
      finishMatch(r1[0].id, r1[0].team_2_id); // побеждает сид 5

      const u2p1 = slotOf(slotRows(), 'upper', 2, 1);
      // сид 1 (bye) против победителя (4,5) — сид 5
      assert.deepStrictEqual(seedsOf(u2p1), [1, 5]);
    });

    it("повторный вызов роутинга не создаёт дублей", async () => {
      await seedTeams(8);
      await bracketService.generate(4, 1);
      const r1 = slotRows().filter(r => r.stage === 'upper' && r.round === 1);
      for (const m of r1) {
        finishMatch(m.id, m.team_1_id);
        bracketService.onMatchFinished(m.id); // повтор
      }
      const rows = slotRows();
      assert.strictEqual(rows.filter(r => r.stage === 'upper' && r.round === 2).length, 2);
      assert.strictEqual(rows.filter(r => r.stage === 'lower' && r.round === 1).length, 2);
    });

    it("матричный матч (без слота) роутинг не трогает", async () => {
      await seedTeams(8);
      await bracketService.generate(4, 1);
      const { id } = db.run(
        `INSERT INTO match_110 (tournament_id, team_1_id, team_2_id, court_id)
         VALUES (4, 9001, 9002, (SELECT id FROM court WHERE tournament_id = 4 LIMIT 1))`
      );
      const before = slotRows().length;
      finishMatch(id, 9001);
      assert.strictEqual(slotRows().length, before);
    });
  });

  describe("корзины (org 1, residents > 1)", () => {
    // 4 команды котла A, residents 2: К1,К2 → корзина 1, К3,К4 → корзина 2;
    // сила убывает с номером. Настройки включаются до сеяния команд —
    // хук добавления команды сразу укладывает их в корзины
    const seedOne = async (lastname: string, rating: number, k: number): Promise<number> => {
      const { id: userId } = await userService.create(lastname, "Игрок", "Отчество", 500, 1, 1, "1990-01-01");
      db.run(`INSERT INTO user_lab (user_id, rating_1) VALUES (?, ?)`, [userId, rating]);
      const { id: teamId } = teamService.create(4, 1, `Корзинная ${k}`, 1, ((k - 1) % 12) + 1);
      teamUserService.create(teamId, userId, 1);
      return teamId;
    };
    const seedBaskets = async (): Promise<{ a: number; b: number; c: number; d: number }> => {
      db.run(`UPDATE tournament SET tournament_status_id = 2 WHERE id = 4`);
      await settingsService.set('org_system.a', '1', 4);
      await settingsService.set('group_residents.a', '2', 4);
      const a = await seedOne("Корзинный1", 990, 1);
      const b = await seedOne("Корзинный2", 980, 2);
      const c = await seedOne("Корзинный3", 970, 3);
      const d = await seedOne("Корзинный4", 960, 4);
      return { a, b, c, d };
    };
    const stageOf = (matchId: number): string | null =>
      db.get<{ stage: string | null }>(`SELECT stage FROM match_110 WHERE id = ?`, [matchId])!.stage;

    it("матричные матчи котла с групповым этапом имеют stage='group' и group_id котла; при org 2 — stage NULL", async () => {
      const { a, b } = await seedBaskets();
      const { id: groupMatch } = matchService.create110(a, b, 4);
      assert.strictEqual(stageOf(groupMatch), 'group');
      const row = db.get<{ group_id: number | null }>(`SELECT group_id FROM match_110 WHERE id = ?`, [groupMatch])!;
      assert.strictEqual(row.group_id, 1);

      await settingsService.set('org_system.a', '2', 4);
      const { id: roundRobinMatch } = matchService.create110(a, b, 4);
      assert.strictEqual(stageOf(roundRobinMatch), null);
    });

    it("generate до завершения групповых матчей отклоняется", async () => {
      const { a, b, c, d } = await seedBaskets();
      matchService.create110(a, b, 4); // корзина 1, не сыгран
      matchService.create110(c, d, 4); // корзина 2, не сыгран
      await assert.rejects(() => bracketService.generate(4, 1), /групповой этап не завершён/);
    });

    it("после групповых generate сеет плей-офф на 4: первые корзин — сиды 1 и 2, вторые — 3 и 4", async () => {
      const { a, b, c, d } = await seedBaskets();
      // серпантин: корзина 1 = {a, d}, корзина 2 = {b, c}; матрица — матчи корзин
      const m1 = matchService.create110(a, d, 4);
      const m2 = matchService.create110(b, c, 4);
      // игра создаётся открытием табло (как в матрице)
      new Game110().create(m1.id);
      new Game110().create(m2.id);
      finishMatch(m1.id, a); // корзина 1: a первый (сид 1), d второй (сид 4)
      finishMatch(m2.id, c); // корзина 2: c первый (сид 2), b второй (сид 3)
      await bracketService.generate(4, 1);

      const r1 = slotRows().filter(r => r.stage === 'upper' && r.round === 1);
      assert.strictEqual(r1.length, 2);
      const pairs = r1.map(r => [r.team_1_id, r.team_2_id].sort((x, y) => x - y).join("-")).sort();
      // серпантин: корзины {a,d},{b,c}, сеяние 1..4 = a,c,d,b → (1v4), (2v3)
      // — первые корзин расходятся по половинам сетки
      const expected = [[a, b], [c, d]].map(p => p.sort((x, y) => x - y).join("-")).sort();
      assert.deepStrictEqual(pairs, expected);
    });

    it("групповые матчи не участвуют в роутинге сетки", async () => {
      const { a, b, c, d } = await seedBaskets();
      const m1 = matchService.create110(a, b, 4);
      matchService.create110(c, d, 4);
      finishMatch(m1.id, a); // onMatchFinished для stage='group' — без слотов
      assert.strictEqual(slotRows().filter(r => r.stage !== 'group').length, 0);
    });

    it("матрица, созданная до переключения в org 1 (stage NULL), не блокирует генерацию", async () => {
      const { a, b, c, d } = await seedBaskets();
      // матрица при org 2 (groupStage false) получает stage NULL; после
      // переключения обратно в org 1 она не считается незавершённым
      // групповым — генерации мешают только stage='group'
      await settingsService.set('org_system.a', '2', 4);
      // после переключения в org 1 серпантин: корзина 1 = {a, d}, 2 = {b, c}
      const m1 = matchService.create110(a, d, 4);
      const m2 = matchService.create110(b, c, 4);
      const m3 = matchService.create110(a, c, 4); // останется незавершённым
      await settingsService.set('org_system.a', '1', 4);
      new Game110().create(m1.id);
      new Game110().create(m2.id);
      finishMatch(m1.id, a);
      finishMatch(m2.id, c);

      await bracketService.generate(4, 1);

      const r1 = slotRows().filter(r => r.stage === 'upper' && r.round === 1);
      assert.strictEqual(r1.length, 2); // сеется: первые корзин a и c
    });
  });
});