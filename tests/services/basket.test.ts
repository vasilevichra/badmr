import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import BasketService from "../../src/services/basket.ts";
import SettingsService from "../../src/services/settings.ts";
import TeamService from "../../src/services/team.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const baskets = new BasketService();
const settingsService = new SettingsService();
const teamService = new TeamService();
const db = new Repository().db;

let colorSeq = 0;

// команда в котле C (группа 5) без игроков — для раскладки игроки не нужны
const seedTeam = async (name: string, groupId = 5): Promise<number> => {
  const { id } = teamService.create(4, groupId, name, 1, (colorSeq++ % 12) + 1);
  return id;
};

const teamBasket = (teamId: number): number | null =>
    db.get<{ basket: number | null }>(`SELECT basket FROM team WHERE id = ?`, [teamId])!.basket;

describe("Basket (корзины группового этапа)", () => {
  beforeEach(async () => {
    await clean();
    colorSeq = 0;
  });

  it("layout делит команды по размеру корзины (6 команд, residents=3 → 1,1,1,2,2,2)", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "3", 4);
    const teams = [];
    for (let i = 1; i <= 6; i++) teams.push(await seedTeam(`К${i}`));

    baskets.layout(4, 5);

    assert.deepStrictEqual(teams.map(teamBasket), [1, 1, 1, 2, 2, 2]);
  });

  it("onTeamAdded укладывает команду в первую неполную корзину", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "2", 4);
    await seedTeam("К1");
    await seedTeam("К2");
    const fourth = await seedTeam("К4");

    // третья команда попадает во вторую корзину
    const third = await seedTeam("К3");

    assert.strictEqual(teamBasket(third), 2);
    assert.strictEqual(teamBasket(fourth), 2);
    // корзины уплотнены: 1,1,2,2
    assert.deepStrictEqual(
        [...baskets.baskets(5).entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b),
        [1, 1, 2, 2]);
  });

  it("layout уплотняет корзины после удаления команды", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "2", 4);
    const a = await seedTeam("К1");
    await seedTeam("К2");
    const c = await seedTeam("К3");
    const d = await seedTeam("К4");
    // 4 команды → 1,1,2,2; после удаления К2 уплотняется: a,c → 1, d → 2
    db.run(`DELETE FROM team WHERE group_id = 5 AND name = 'К2'`);

    baskets.layout(4, 5);

    assert.deepStrictEqual([teamBasket(a), teamBasket(c), teamBasket(d)], [1, 1, 2]);
  });

  it("onOrgSystemSet '2' сбрасывает корзины, '1' раскладывает заново", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "2", 4);
    const a = await seedTeam("К1");
    const b = await seedTeam("К2");

    baskets.onOrgSystemSet(4, "org_system.c", "2");
    assert.deepStrictEqual([teamBasket(a), teamBasket(b)], [null, null]);

    baskets.onOrgSystemSet(4, "org_system.c", "1");
    // 2 команды при residents=2 — обе в первой корзине
    assert.deepStrictEqual([teamBasket(a), teamBasket(b)], [1, 1]);
  });

  it("orgSystem: мультибуквенная группа — 2, котёл без оверрайда — 2, с оверрайдом — 1", async () => {
    assert.strictEqual(baskets.orgSystem(4, 2), 2);   // AB — не одиночная буква
    assert.strictEqual(baskets.orgSystem(4, 5), 2);   // C, дефолт
    await settingsService.set("org_system.c", "1", 4);
    assert.strictEqual(baskets.orgSystem(4, 5), 1);
  });

  it("groupStage: org 1 + residents>1 → true, residents=1 → false, org 2 → false", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "1", 4);
    assert.strictEqual(baskets.groupStage(4, 5), false);

    await settingsService.set("group_residents.c", "3", 4);
    assert.strictEqual(baskets.groupStage(4, 5), true);

    await settingsService.set("org_system.c", "2", 4);
    assert.strictEqual(baskets.groupStage(4, 5), false);
  });

  it("letter распознаёт одиночные буквы a-h в любом регистре", () => {
    assert.strictEqual(baskets.letter("C"), "c");
    assert.strictEqual(baskets.letter("h"), "h");
    assert.strictEqual(baskets.letter("AB"), null);
  });
});
