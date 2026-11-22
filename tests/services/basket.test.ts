import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import BasketService from "../../src/services/basket.ts";
import SettingsService from "../../src/services/settings.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Match110Repository from "../../src/repositories/match110.ts";
import Game110Repository from "../../src/repositories/game110.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const baskets = new BasketService();
const settingsService = new SettingsService();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const match110 = new Match110Repository();
const game110 = new Game110Repository();
const db = new Repository().db;

let colorSeq = 0;

// команда в котле C (группа 5) без игроков — для раскладки игроки не нужны
const seedTeam = async (name: string, groupId = 5): Promise<number> => {
  const { id } = teamService.create(4, groupId, name, 1, (colorSeq++ % 12) + 1);
  return id;
};

// команда с игроками и рейтингами: рейтинг пары — среднее rating_1 игроков
const seedRatedTeam = async (name: string, ratings: number[], groupId = 5): Promise<number> => {
  const teamId = await seedTeam(name, groupId);
  for (const rating of ratings) {
    const { id: userId } = await userService.create(name, "Игрок", "Отчество", rating, 1, 1, "1990-01-01");
    db.run(`INSERT INTO user_lab (user_id, rating_1) VALUES (?, ?)`, [userId, rating]);
    teamUserService.create(teamId, userId, groupId);
  }
  return teamId;
};

const teamBasket = (teamId: number): number | null =>
    db.get<{ basket: number | null }>(`SELECT basket FROM team WHERE id = ?`, [teamId])!.basket;

describe("Basket (корзины группового этапа)", () => {
  beforeEach(async () => {
    await clean();
    colorSeq = 0;
  });

  it("layout без рейтингов сеет серпантином по заявкам (6 команд, residents=3 → 1,2,2,1,1,2)", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "3", 4);
    const teams = [];
    for (let i = 1; i <= 6; i++) teams.push(await seedTeam(`К${i}`));

    baskets.layout(4, 5);

    assert.deepStrictEqual(teams.map(teamBasket), [1, 2, 2, 1, 1, 2]);
  });

  it("layout сеет серпантином по среднему рейтингу пары: сильнейшие в разных корзинах", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "2", 4);
    // рейтинги: К1=900, К2=1200, К3=1000, К4=800; порядок сеяния К2,К3,К1,К4
    const k1 = await seedRatedTeam("К1", [900, 900]);
    const k2 = await seedRatedTeam("К2", [1200]);
    const k3 = await seedRatedTeam("К3", [1200, 800]); // среднее 1000
    const k4 = await seedRatedTeam("К4", [800]);

    baskets.layout(4, 5);

    assert.deepStrictEqual(
        [teamBasket(k1), teamBasket(k2), teamBasket(k3), teamBasket(k4)],
        [2, 1, 2, 1]);
  });

  it("layout: команды без рейтинга — в хвост в порядке заявок", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "1", 4);
    const u1 = await seedTeam("У1");
    const u2 = await seedTeam("У2");
    const r = await seedRatedTeam("Р", [1000]); // заявлена последней, но с рейтингом

    baskets.layout(4, 5);

    assert.deepStrictEqual([teamBasket(r), teamBasket(u1), teamBasket(u2)], [1, 2, 3]);
  });

  it("layout: сыгранный матч котла замораживает раскладку — серпантин не трогает корзины", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "2", 4);
    const k1 = await seedRatedTeam("К1", [900]);
    const k2 = await seedRatedTeam("К2", [1200]);
    const k3 = await seedRatedTeam("К3", [1000]);
    const k4 = await seedRatedTeam("К4", [800]);
    baskets.layout(4, 5); // К2,К4 → 1; К3,К1 → 2
    // первая сыгранная игра котла
    const { id: mid } = match110.create(k2, k3, 4);
    game110.create(mid);
    db.run(`UPDATE game_110 SET score_1 = 110, score_2 = 90 WHERE match_110_id = ?`, [mid]);
    db.run(`UPDATE match_110 SET finished = 1 WHERE id = ?`, [mid]);

    // рейтинг К1 вырос — пересеивания нет
    db.run(`UPDATE user_lab SET rating_1 = 2000 WHERE user_id IN (SELECT user_id FROM team_user WHERE team_id = ?)`, [k1]);
    baskets.layout(4, 5);

    assert.deepStrictEqual(
        [teamBasket(k1), teamBasket(k2), teamBasket(k3), teamBasket(k4)],
        [2, 1, 2, 1]);
    // новая заявка при заморозке — в новую корзину за последней неполной
    const k5 = await seedTeam("К5");
    baskets.onTeamAdded(4, 5);
    assert.strictEqual(teamBasket(k5), 3);
  });

  it("onTeamAdded укладывает команду в первую неполную корзину", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "2", 4);
    await seedTeam("К1");
    await seedTeam("К2");
    const fourth = await seedTeam("К4");

    // третья команда (id позже четвёртой) при серпантине встаёт по своей
    // позиции в общем порядке: К1,К2,К4,К3 → 1,2,2,1
    const third = await seedTeam("К3");

    assert.strictEqual(teamBasket(third), 1);
    assert.strictEqual(teamBasket(fourth), 2);
    // корзины уплотнены серпантином: 1,2,2,1
    assert.deepStrictEqual(
        [...baskets.baskets(5).entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b),
        [1, 2, 2, 1]);
  });

  it("layout уплотняет корзины после удаления команды", async () => {
    await settingsService.set("org_system.c", "1", 4);
    await settingsService.set("group_residents.c", "2", 4);
    const a = await seedTeam("К1");
    await seedTeam("К2");
    const c = await seedTeam("К3");
    const d = await seedTeam("К4");
    // 4 команды → серпантин 1,2,2,1; после удаления К2: a,c,d → 1,2,2
    db.run(`DELETE FROM team WHERE group_id = 5 AND name = 'К2'`);

    baskets.layout(4, 5);

    assert.deepStrictEqual([teamBasket(a), teamBasket(c), teamBasket(d)], [1, 2, 2]);
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
