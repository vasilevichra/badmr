import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import BracketHistory from "../../src/services/bracket-history.ts";
import Match110Repository from "../../src/repositories/match110.ts";
import Game110Repository from "../../src/repositories/game110.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const history = new BracketHistory();
const match110 = new Match110Repository();
const game110 = new Game110Repository();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

let colorSeq = 0;

// котлы фикстуры: группа 5 = 'C', группа 7 = 'D'
const GROUP_C = 5;
const GROUP_D = 7;

const seedTeam = async (name: string, groupId: number): Promise<number> => {
  const { id: userId } = await userService.create(name, "Игрок", "Отчество", 500, 1, 1, "1990-01-01");
  const { id: teamId } = teamService.create(4, groupId, name, 1, (colorSeq++ % 12) + 1);
  teamUserService.create(teamId, userId, groupId);
  return teamId;
};

// завершённый матч 110 с фиксированным счётом (без слотов — историческая матрица)
const play = (a: number, b: number, scoreA: number, scoreB: number): number => {
  const { id } = match110.create(a, b, 4);
  game110.create(id);
  db.run(`UPDATE game_110 SET score_1 = ?, score_2 = ? WHERE match_110_id = ?`,
      [scoreA, scoreB, id]);
  db.run(`UPDATE match_110 SET finished = 1 WHERE id = ?`, [id]);
  return id;
};

// начатый, но не завершённый матч
const start = (a: number, b: number): number => {
  const { id } = match110.create(a, b, 4);
  game110.create(id);
  return id;
};

describe("BracketHistory (историческая сетка архива 110)", () => {
  beforeEach(async () => {
    await clean();
    colorSeq = 0;
  });

  it("реконструкция: котлы C и D, раунды по цепочке матчей, победитель по счёту", async () => {
    const c1 = await seedTeam("C1", GROUP_C);
    const c2 = await seedTeam("C2", GROUP_C);
    const c3 = await seedTeam("C3", GROUP_C);
    const c4 = await seedTeam("C4", GROUP_C);
    const d1 = await seedTeam("D1", GROUP_D);
    const d2 = await seedTeam("D2", GROUP_D);
    const d3 = await seedTeam("D3", GROUP_D);

    play(c1, c2, 110, 80);  // котёл C, круг 1
    play(c3, c4, 90, 110);  // котёл C, круг 1
    play(c1, c4, 110, 70);  // котёл C, круг 2 (оба уже играли)
    play(d1, d2, 100, 110); // котёл D, круг 1
    play(d2, d3, 110, 50);  // котёл D, круг 2 (d2 играл, d3 — нет)
    const unfinishedId = start(c2, c3); // котёл C, круг 2, не завершён

    const data = history.historical110(4);
    assert.deepStrictEqual(data.pockets.map(p => p.name), ['C', 'D']);

    const pocketC = data.pockets[0];
    assert.strictEqual(pocketC.rounds.length, 2);
    assert.strictEqual(pocketC.rounds[0].length, 2);
    assert.strictEqual(pocketC.rounds[1].length, 2);
    const finishedR2 = pocketC.rounds[1].find(m => m.finished === 1)!;
    assert.strictEqual(finishedR2.id, 3);
    assert.strictEqual(finishedR2.winner_id, c1);
    assert.strictEqual(finishedR2.team_1.name, 'C1');
    assert.strictEqual(typeof finishedR2.team_1.city, 'string');
    // цвет команды — hex из team_color (полоска в строке сетки)
    assert.strictEqual(typeof finishedR2.team_1.color, 'string');
    assert.match(finishedR2.team_1.color, /^[0-9a-f]{6}$/);
    const unfinished = pocketC.rounds[1].find(m => m.id === unfinishedId)!;
    assert.strictEqual(unfinished.finished, 0);
    assert.strictEqual(unfinished.winner_id, null);
    // победитель по счёту: во втором матче круга 1 выиграла команда 2
    assert.strictEqual(pocketC.rounds[0][1].winner_id, c4);

    const pocketD = data.pockets[1];
    assert.strictEqual(pocketD.rounds.length, 2);
    assert.strictEqual(pocketD.rounds[0].length, 1);
    assert.strictEqual(pocketD.rounds[1].length, 1);
    assert.strictEqual(pocketD.rounds[1][0].winner_id, d2);
  });

  it("котёл без матчей входит с пустыми раундами; матчи без игрового счёта не падают", async () => {
    const c1 = await seedTeam("C1", GROUP_C);
    const c2 = await seedTeam("C2", GROUP_C);
    await seedTeam("D1", GROUP_D);
    await seedTeam("D2", GROUP_D);
    play(c1, c2, 110, 80);
    const data = history.historical110(4);
    assert.deepStrictEqual(data.pockets.map(p => p.name), ['C', 'D']);
    assert.strictEqual(data.pockets[0].rounds.length, 1);
    assert.strictEqual(data.pockets[1].rounds.length, 0);
  });

  it("pocket_structure перекрывает реконструкцию; частичная разметка — фолбэк", async () => {
    const d1 = await seedTeam("D1", GROUP_D);
    const d2 = await seedTeam("D2", GROUP_D);
    const d3 = await seedTeam("D3", GROUP_D);
    const d4 = await seedTeam("D4", GROUP_D);
    const semi1 = play(d1, d2, 110, 80);
    const semi2 = play(d3, d4, 100, 110);
    const third = play(d2, d3, 110, 90);  // по эвристике — доигровка (оба проиграли)
    const final = play(d1, d4, 110, 70);

    // разметка против эвристики: third — основное дерево, final — доигровка
    db.run(`INSERT INTO pocket_structure (match_110_id, main, round) VALUES (?, 1, 1), (?, 1, 1), (?, 1, 2), (?, 0, 1)`,
        [semi1, semi2, third, final]);
    const data = history.historical110(4);
    const pocket = data.pockets[0];
    assert.strictEqual(pocket.twoLives, false);
    assert.deepStrictEqual(pocket.rounds.map(r => r.map(m => m.id)), [[semi1, semi2], [third]]);
    assert.deepStrictEqual(pocket.consRounds.map(r => r.map(m => m.id)), [[final]]);

    // незавершённый матч без разметки — размечаем не все, работает эвристика
    const extra = start(d3, d4);
    const fallback = history.historical110(4).pockets[0];
    assert.strictEqual(fallback.twoLives, false);
    assert.deepStrictEqual(fallback.rounds.map(r => r.map(m => m.id)), [[semi1, semi2], [final]]);
    assert.deepStrictEqual(fallback.consRounds.map(r => r.map(m => m.id)), [[third], [extra]]);
  });

  it("бай 1-го круга: команда, впервые играющая в дереве после 1-го круга", async () => {
    const d1 = await seedTeam("D1", GROUP_D);
    const d2 = await seedTeam("D2", GROUP_D);
    const d3 = await seedTeam("D3", GROUP_D);
    const semi = play(d1, d2, 110, 80);
    const final = play(d1, d3, 110, 70); // d3 выходит в финал без игры 1-го круга
    db.run(`INSERT INTO pocket_structure (match_110_id, main, round) VALUES (?, 1, 1), (?, 1, 2)`, [semi, final]);
    const pocket = history.historical110(4).pockets[0];
    assert.strictEqual(pocket.twoLives, false);
    // бай d3 привязан к полуфиналу: его соперник по финалу (d1) вышел из него
    assert.deepStrictEqual(pocket.mainByes.map(b => [b.team.name, b.after]), [['D3', semi]]);
    assert.deepStrictEqual(pocket.consByes, []);
    // места: победитель финала — 1, бай — 2, вылетевший в 1-м круге — 3;
    // место ставится только в последний матч команды
    const finalMatch = pocket.rounds[1][0];
    assert.strictEqual(finalMatch.place_1, 1);
    assert.strictEqual(finalMatch.place_2, 2);
    // d1 в полуфинале — не последний матч: места нет; d2 вылетел там — 3-е
    assert.strictEqual(pocket.rounds[0][0].place_1, null);
    assert.strictEqual(pocket.rounds[0][0].place_2, 3);
  });

  it("места: независимые матчи одного круга доигровок ранжируются по кругу вылета из main", async () => {
    // зеркало котла C: main R1 m1/m8/m12 (бай t6), R2 m7/m10, финал m14;
    // cons R1 m3, R2 m4 и m5 (m5 — за 3–4: его участники вылетели из main
    // позже, чем участники m4)
    const t1 = await seedTeam("T1", GROUP_D);
    const t2 = await seedTeam("T2", GROUP_D);
    const t3 = await seedTeam("T3", GROUP_D);
    const t4 = await seedTeam("T4", GROUP_D);
    const t5 = await seedTeam("T5", GROUP_D);
    const t6 = await seedTeam("T6", GROUP_D);
    const t7 = await seedTeam("T7", GROUP_D);
    const m1 = play(t1, t2, 110, 80);
    const m8 = play(t3, t4, 110, 90);
    const m12 = play(t5, t7, 110, 50);
    const m7 = play(t6, t3, 110, 90);
    const m10 = play(t5, t1, 110, 60);
    const m14 = play(t5, t6, 110, 100);
    const m3 = play(t2, t7, 110, 99);
    const m4 = play(t4, t2, 110, 80);
    const m5 = play(t1, t3, 110, 95);
    db.run(`INSERT INTO pocket_structure (match_110_id, main, round) VALUES
        (${m1}, 1, 1), (${m8}, 1, 1), (${m12}, 1, 1),
        (${m7}, 1, 2), (${m10}, 1, 2), (${m14}, 1, 3),
        (${m3}, 0, 1), (${m4}, 0, 2), (${m5}, 0, 2)`);
    const byId = new Map<number, {place_1: number | null; place_2: number | null}>();
    for (const p of history.historical110(4).pockets) {
      for (const round of [...p.rounds, ...p.consRounds]) {
        for (const m of round) byId.set(m.id, m);
      }
    }
    // 1–2: финал main; 3–4: m5 (вылет из R2); 5–6: m4 (вылет из R1); 7: m3
    assert.deepStrictEqual([byId.get(m14)!.place_1, byId.get(m14)!.place_2], [1, 2]);
    assert.deepStrictEqual([byId.get(m5)!.place_1, byId.get(m5)!.place_2], [3, 4]);
    assert.deepStrictEqual([byId.get(m4)!.place_1, byId.get(m4)!.place_2], [5, 6]);
    assert.deepStrictEqual([byId.get(m3)!.place_1, byId.get(m3)!.place_2], [null, 7]);
    // порядок плашек в колонке финального круга доигровок — по разыгранному
    // месту: матч за 3–4 выше матча за 5–6, хотя сыгран позже
    const d = history.historical110(4).pockets.find(p => p.group_id === GROUP_D);
    assert.deepStrictEqual(d!.consRounds.at(-1)!.map(m => m.id), [m5, m4]);
  });

  it("матч двух уже проигравших — доигровка: дерево победителей и consRounds раздельно", async () => {
    const d1 = await seedTeam("D1", GROUP_D);
    const d2 = await seedTeam("D2", GROUP_D);
    const d3 = await seedTeam("D3", GROUP_D);
    const d4 = await seedTeam("D4", GROUP_D);
    const semi1 = play(d1, d2, 110, 80); // d2 проигрывает
    const semi2 = play(d3, d4, 100, 110); // d3 проигрывает
    const third = play(d2, d3, 110, 90); // матч двух проигравших — доигровка
    const final = play(d1, d4, 110, 70);
    const data = history.historical110(4);
    const pocket = data.pockets[0];
    assert.strictEqual(pocket.twoLives, false);
    // дерево победителей: два полуфинала и финал
    assert.deepStrictEqual(pocket.rounds.map(r => r.map(m => m.id)), [[semi1, semi2], [final]]);
    // доигровки: матч проигравших в первом круге consolation
    assert.deepStrictEqual(pocket.consRounds.map(r => r.map(m => m.id)), [[third]]);
  });
});
