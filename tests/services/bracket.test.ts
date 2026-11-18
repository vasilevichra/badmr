import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import BracketService from "../../src/services/bracket.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const bracketService = new BracketService();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

interface SlotRow {
  id: number;
  team_1_id: number;
  team_2_id: number;
  stage: 'upper' | 'lower' | null;
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

// сеет n команд по 1 игроку в текущий турнир фикстура (4), сила команды
// убывает с номером: сила = рейтинг игрока из user_lab → сид k = k-я
// по силе команда. Турнир переводится в статус «Идёт» (2).
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
      await bracketService.generate();

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
      await bracketService.generate();

      const r1 = slotRows().filter(r => r.stage === 'upper' && r.round === 1);
      assert.strictEqual(r1.length, 4);
      const playing = new Set(r1.flatMap(r => [r.team_1_id, r.team_2_id]));
      assert.strictEqual(playing.size, 8);
    });

    it("повторная генерация отклоняется", async () => {
      await seedTeams(8);
      await bracketService.generate();
      await assert.rejects(() => bracketService.generate(), /уже сгенерирована/);
    });

    it("не идущий турнир отклоняется", async () => {
      await assert.rejects(() => bracketService.generate(4), /идущего турнира/);
    });

    it("круговая система (3) отклоняется", async () => {
      await seedTeams(8);
      db.run(
        `INSERT INTO tournament_settings (defaults_id, tournament_id, value) VALUES (40, 4, '3')`
      );
      await assert.rejects(() => bracketService.generate(), /систем 1 и 2/);
    });
  });

  describe("роутинг по завершении матча", () => {
    it("после двух матчей R1 создан матч R2 из победителей; карман проигравших ждёт своих", async () => {
      const seedToTeam = await seedTeams(8);
      await bracketService.generate();

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
      await bracketService.generate();

      for (const m of slotRows().filter(r => r.stage === 'upper' && r.round === 1)) {
        finishMatch(m.id, m.team_1_id);
      }

      const rows = slotRows();
      assert.strictEqual(rows.filter(r => r.stage === 'upper' && r.round === 2).length, 2);
      assert.strictEqual(rows.filter(r => r.stage === 'lower' && r.round === 1).length, 2);
    });

    it("повторный вызов роутинга не создаёт дублей", async () => {
      await seedTeams(8);
      await bracketService.generate();
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
      await bracketService.generate();
      const { id } = db.run(
        `INSERT INTO match_110 (tournament_id, team_1_id, team_2_id, court_id)
         VALUES (4, 9001, 9002, (SELECT id FROM court WHERE tournament_id = 4 LIMIT 1))`
      );
      const before = slotRows().length;
      finishMatch(id, 9001);
      assert.strictEqual(slotRows().length, before);
    });
  });
});
