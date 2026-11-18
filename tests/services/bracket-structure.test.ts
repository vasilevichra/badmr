import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bracketSize, structure, targetOf, type BracketStructure } from "../../src/services/bracket-structure.ts";

describe("bracket-structure", () => {
  describe("bracketSize", () => {
    it("округляет до степени двойки вверх", () => {
      assert.strictEqual(bracketSize(12), 16);
      assert.strictEqual(bracketSize(8), 8);
      assert.strictEqual(bracketSize(2), 2);
      assert.strictEqual(bracketSize(9), 16);
    });
  });

  describe("structure(8, 0) — без bye", () => {
    const s = structure(8, 0);

    it("содержит 7 верхних матчей: 4+2+1", () => {
      const upper = s.slots.filter(x => x.stage === 'upper');
      assert.strictEqual(upper.length, 7);
      assert.strictEqual(upper.filter(x => x.round === 1).length, 4);
      assert.strictEqual(upper.filter(x => x.round === 2).length, 2);
      assert.strictEqual(upper.filter(x => x.round === 3).length, 1);
    });

    it("пары раунда 1 по стандартной раскладке (1v8),(4v5),(3v6),(2v7)", () => {
      const r1 = s.slots.filter(x => x.stage === 'upper' && x.round === 1);
      const pairs = r1.map(x => x.seeds).sort((a, b) => a[0] - b[0]);
      assert.deepStrictEqual(pairs, [[1, 8], [3, 6], [4, 5], [2, 7]].sort((a, b) => a[0] - b[0]));
      assert.ok(r1.every(x => x.feeders === null));
    });

    it("диапазоны мест: финал 1..2, полуфиналы 3..4, четвертьфиналы 5..8", () => {
      const final = s.slots.find(x => x.stage === 'upper' && x.round === 3)!;
      assert.strictEqual(final.placeFrom, 1);
      assert.strictEqual(final.placeTo, 2);
      const semis = s.slots.filter(x => x.stage === 'upper' && x.round === 2);
      assert.ok(semis.every(x => x.placeFrom === 3 && x.placeTo === 4));
      const quarters = s.slots.filter(x => x.stage === 'upper' && x.round === 1);
      assert.ok(quarters.every(x => x.placeFrom === 5 && x.placeTo === 8));
    });

    it("feeders полуфиналов — верхние матчи раунда 1", () => {
      const final = s.slots.find(x => x.stage === 'upper' && x.round === 3)!;
      assert.ok(final.feeders);
      const ref = final.feeders![0];
      assert.strictEqual(ref.stage, 'upper');
      assert.strictEqual(ref.round, 2);
    });

    it("проигравшие 1/4 попадают в lower-карман [5..8], 1/2 — в матч за 3-4", () => {
      const r1 = s.slots.filter(x => x.stage === 'upper' && x.round === 1);
      for (const q of r1) {
        const t = targetOf(s, q, 'lose');
        assert.ok(t);
        assert.strictEqual(t.stage, 'lower');
        const pocket = s.slots.find(x => x.stage === 'lower' && x.round === t!.round && x.pos === t!.pos)!;
        assert.strictEqual(pocket.placeFrom, 5);
        assert.strictEqual(pocket.placeTo, 8);
      }
      const semi = s.slots.find(x => x.stage === 'upper' && x.round === 2 && x.pos === 1)!;
      const t = targetOf(s, semi, 'lose')!;
      assert.deepStrictEqual(t, { stage: 'lower', round: 2, pos: 1 });
      const m34 = s.slots.find(x => x.stage === 'lower' && x.round === 2 && x.pos === 1)!;
      assert.strictEqual(m34.placeFrom, 3);
      assert.strictEqual(m34.placeTo, 4);
    });

    it("targetOf финала: win → null (чемпион), lose → null (матча за 2-е нет)", () => {
      const final = s.slots.find(x => x.stage === 'upper' && x.round === 3)!;
      assert.strictEqual(targetOf(s, final, 'win'), null);
      assert.strictEqual(targetOf(s, final, 'lose'), null);
    });

    it("targetOf lower-матча: lose → null (выбыл окончательно)", () => {
      const m34 = s.slots.find(x => x.stage === 'lower' && x.round === 2 && x.pos === 1)!;
      assert.strictEqual(targetOf(s, m34, 'lose'), null);
      assert.strictEqual(targetOf(s, m34, 'win'), null);
    });
  });

  describe("structure(12, 0) — bye у сидов 1..4", () => {
    const s = structure(12, 0);

    it("size 16, в раунде 1 четыре матча с реальными парами, bye-пары без матчей", () => {
      assert.strictEqual(s.size, 16);
      const r1 = s.slots.filter(x => x.stage === 'upper' && x.round === 1);
      // матчей только там, где нет bye: пары (5v12),(6v11),(7v10),(8v9)
      assert.strictEqual(r1.length, 4);
      const pairs = r1.map(x => x.seeds).sort((a, b) => a[0] - b[0]);
      assert.deepStrictEqual(pairs, [[5, 12], [6, 11], [7, 10], [8, 9]].sort((a, b) => a[0] - b[0]));
    });

    it("bye-команды (сиды 1-4) попадают в раунд 2 напрямую: feeders раунда 2 включают bye-сеяные", () => {
      const r2 = s.slots.filter(x => x.stage === 'upper' && x.round === 2);
      // в 16-сетке раунд 2 = 4 матча: победители 4 матчей R1 + 4 bye-сиды
      assert.strictEqual(r2.length, 4);
      // сеяные источники у них — победители пар R1 и bye-сиды
      const byeSeeds = r2.flatMap(x => x.seeds).filter(x => x >= 1 && x <= 4);
      assert.strictEqual(byeSeeds.length, 4);
      assert.ok(r2.every(x => x.feeders));
    });

    it("карман R1-проигравших [9..12]: два матча уровня 1, победители → матч за 9-10, проигравшие → матч за 11-12", () => {
      const pocket1 = s.slots.filter(x => x.stage === 'lower' && x.placeFrom === 9 && x.placeTo === 12);
      assert.strictEqual(pocket1.length, 2);
      const m910 = s.slots.find(x => x.stage === 'lower' && x.placeFrom === 9 && x.placeTo === 10);
      assert.ok(m910);
      const m1112 = s.slots.find(x => x.stage === 'lower' && x.placeFrom === 11 && x.placeTo === 12);
      assert.ok(m1112);
    });
  });

  describe("глубина доигровок", () => {
    it("structure(8, 2) без bye — глубина не режет (карманы мельче лимита)", () => {
      const a = structure(8, 0);
      const b = structure(8, 2);
      assert.deepStrictEqual(b.slots, a.slots);
    });

    it("structure(16, 2): в кармане [9..16] матчи уровней 1-2 есть, третьего уровня — нет", () => {
      const s = structure(16, 2);
      // карман проигравших R1 (8 команд, места 9..16): уровень 1 — 4 матча
      const level1 = s.slots.filter(x => x.stage === 'lower' && x.placeFrom === 9 && x.placeTo === 16);
      assert.strictEqual(level1.length, 4);
      // уровень 2: подкарманы [9..12] и [13..16] по 2 матча (фильтр по
      // полному диапазону — уровень 1 тоже имеет placeFrom 9)
      const level2 = s.slots.filter(x => x.stage === 'lower'
        && (x.placeFrom === 9 && x.placeTo === 12 || x.placeFrom === 13 && x.placeTo === 16));
      assert.strictEqual(level2.length, 4);
      // уровень 3 исчерпан (depth=2): матчей за 9-10/11-12/13-14/15-16 нет
      const level3 = s.slots.filter(x => x.stage === 'lower' && x.placeFrom >= 9 && x.placeFrom <= 15 && x.placeTo - x.placeFrom === 1);
      assert.strictEqual(level3.length, 0);
    });
  });
});
