import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import GameService from "../../src/services/game.ts";
import Game110Repository from "../../src/repositories/game110.ts";
import MatchService from "../../src/services/match.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

interface GameRow {
  id: number;
  match_id: number;
  lost_1_by: number | null;
  lost_2_by: number | null;
  created_at: string;
}

interface Game110Row {
  id: number;
  match_110_id: number;
  game_type_id: number;
  score_1: number;
  score_2: number;
  current: number;
}

const gameService = new GameService();
const game110Repository = new Game110Repository();
const matchService = new MatchService();
const teamService = new TeamService();
const teamUserService = new TeamUserService();
const userService = new UserService();
const db = new Repository().db;

// повторное создание сервиса должно вернуть существующий singleton
const sameService = new GameService();

// создаёт 4 пользователей и регистрирует их на текущий турнир
const seedMatchUsers = async (): Promise<number[]> => {
  const ids: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const { id } = await userService.create(`Фамилия${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
    ids.push(id);
  }
  await userService.registerByIds(ids);
  return ids;
};

// создаёт незавершённый матч из 4 пользователей
const seedUnfinishedMatch = async (): Promise<{ ids: number[]; matchId: number }> => {
  const ids = await seedMatchUsers();
  await matchService.create(...(ids as [number, number, number, number]));
  const match = (await matchService.getAll() as { id: number }[])[0];
  return { ids, matchId: match.id };
};

// создаёт две команды с двумя игроками в каждой и матч 110 между ними
const seedMatch110 = async (): Promise<{ team1: number; team2: number; match110Id: number }> => {
  const ids: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const { id } = await userService.create(`Игрок${i}`, `Имя${i}`, "Отчество", 500, 1, 1, "1990-01-01");
    ids.push(id);
  }

  await teamService.create(1, 1, "Команда 1", 1, 1);
  await teamService.create(1, 1, "Команда 2", 2, 2);
  await teamUserService.create(1, ids[0], 1);
  await teamUserService.create(1, ids[1], 1);
  await teamUserService.create(2, ids[2], 1);
  await teamUserService.create(2, ids[3], 1);

  const result = await matchService.create110(1, 2) as { id: number };
  return { team1: 1, team2: 2, match110Id: result.id };
};

describe("Game", () => {
  beforeEach(async () => {
    console.log = function () {};
    await clean();
  });

  describe("constructor", () => {
    it("должен вернуть существующий экземпляр при повторном создании", () => {
      assert.strictEqual(sameService, gameService);
    });
  });

  describe("create, getById", () => {
    it("должен создать игру и вернуть её по id", async () => {
      const { matchId } = await seedUnfinishedMatch();

      const { id } = await gameService.create(matchId, "21", "15", "2026-01-01 10:00:00") as { id: number };

      assert.deepStrictEqual<GameRow | undefined>(await gameService.getById(id), {
        id,
        match_id: matchId,
        lost_1_by: 21,
        lost_2_by: 15,
        created_at: "2026-01-01 10:00:00",
      });
    });

    it("должен создать игру без счёта", async () => {
      const { matchId } = await seedUnfinishedMatch();

      const { id } = await gameService.create(matchId, null, null, "2026-01-01 10:00:00") as { id: number };

      const game = await gameService.getById(id) as unknown as GameRow;
      assert.strictEqual(game.lost_1_by, null);
      assert.strictEqual(game.lost_2_by, null);
    });

    it("не должен поставить created_at игры раньше предыдущей игры матча (история матчей, #баг времен)", async () => {
      // клиентское время приходит из печенек и может быть старше
      // уже записанных игр того же матча — длительности в истории
      // считаются разностями created_at и перемешиваются
      const { matchId } = await seedUnfinishedMatch();

      await gameService.create(matchId, "21", "15", "2026-01-01 10:05:00");
      const { id } = await gameService.create(matchId, "15", "21", "2026-01-01 10:00:00") as { id: number };

      assert.strictEqual((await gameService.getById(id) as unknown as GameRow).created_at, "2026-01-01 10:05:00");
    });

    it("должен вернуть пустой ответ для несуществующей игры", async () => {
      assert.strictEqual(await gameService.getById(999), undefined);
    });
  });

  describe("create110, getById (110)", () => {
    it("должен создать игру 110 с типом МО и текущим статусом", async () => {
      const { match110Id } = await seedMatch110();

      const { id } = await gameService.create110(match110Id) as { id: number };

      const game = await game110Repository.getById(id) as unknown as Game110Row;
      assert.strictEqual(game.match_110_id, match110Id);
      assert.strictEqual(game.game_type_id, 1);
      assert.strictEqual(game.score_1, 0);
      assert.strictEqual(game.score_2, 0);
      assert.strictEqual(game.current, 1);
    });
  });

  describe("getCurrentByTeamIds", () => {
    it("должен вернуть текущую игру матча 110 по командам", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);

      const game = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;

      assert.strictEqual(game.game_type_id, 1);
      assert.strictEqual(game.current, 1);
      assert.strictEqual(game.score_1, 0);
      assert.strictEqual(game.score_2, 0);
    });

    it("должен вернуть пустой ответ для незавершённого матча других команд", async () => {
      await seedMatch110();

      assert.strictEqual(await gameService.getCurrentByTeamIds(1, 3), undefined);
    });

    it("должен вернуть пустой ответ когда матча между командами нет", async () => {
      assert.strictEqual(await gameService.getCurrentByTeamIds(1, 2), undefined);
    });
  });

  describe("increaseCurrentByTeamIds", () => {
    it("должен увеличить счёт первой команды", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);

      await gameService.increaseCurrentByTeamIds(team1, team2, "1");

      const game = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;
      assert.strictEqual(game.score_1, 1);
      assert.strictEqual(game.score_2, 0);
    });

    it("должен увеличить счёт второй команды", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);

      await gameService.increaseCurrentByTeamIds(team1, team2, "2");
      await gameService.increaseCurrentByTeamIds(team1, team2, "2");

      const game = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;
      assert.strictEqual(game.score_1, 0);
      assert.strictEqual(game.score_2, 2);
    });
  });

  // редактирование матча по карандашу в истории: применение пачки игр
  // одним запросом — обновить изменённые, удалить очищенные, создать
  // новые с экстраполированным временем, один каскадный пересчёт в конце
  describe("applyMatchGames", () => {
    const flushRecalc = () => new Promise(r => setImmediate(() => setImmediate(r)));

    const gamesOf = (matchId: number) =>
      db.all<GameRow>("SELECT * FROM game WHERE match_id = ? ORDER BY created_at, id", [matchId]);

    it("должен обновить изменённые игры", async () => {
      const { matchId } = await seedUnfinishedMatch();
      const g1 = await gameService.create(matchId, "15", null, "2026-01-01 10:00:00") as { id: number };
      const g2 = await gameService.create(matchId, "18", null, "2026-01-01 10:10:00") as { id: number };

      await gameService.applyMatchGames(matchId, [
        {id: g1.id, lost_1_by: "8", lost_2_by: null},
        {id: g2.id, lost_1_by: null, lost_2_by: "19"},
      ]);

      assert.deepStrictEqual(gamesOf(matchId).map(g => [g.id, g.lost_1_by, g.lost_2_by]), [
        [g1.id, 8, null],
        [g2.id, null, 19],
      ]);
    });

    it("должен удалить существующую игру с очищенным счётом", async () => {
      const { matchId } = await seedUnfinishedMatch();
      const g1 = await gameService.create(matchId, "15", null, "2026-01-01 10:00:00") as { id: number };
      const g2 = await gameService.create(matchId, "18", null, "2026-01-01 10:10:00") as { id: number };

      await gameService.applyMatchGames(matchId, [
        {id: g1.id, lost_1_by: null, lost_2_by: null},
        {id: g2.id, lost_1_by: "18", lost_2_by: null},
      ]);

      assert.deepStrictEqual(gamesOf(matchId).map(g => g.id), [g2.id]);
    });

    it("должен создать новую игру с экстраполированным created_at", async () => {
      const { matchId } = await seedUnfinishedMatch();
      // g1: 15+21=36 очков; g2: 18+21=39 очков — интервал 600с покрывает
      // игры после первой; 600/39 ≈ 15.38 с/очко; новая игра 19+21=40
      // очков → +615.38с → округление до 615с
      await gameService.create(matchId, "15", null, "2026-01-01 10:00:00");
      await gameService.create(matchId, "18", null, "2026-01-01 10:10:00");

      await gameService.applyMatchGames(matchId, [
        {lost_1_by: null, lost_2_by: "19"},
      ]);

      const games = gamesOf(matchId);
      assert.strictEqual(games.length, 3);
      assert.deepStrictEqual([games[2].lost_1_by, games[2].lost_2_by], [null, 19]);
      assert.strictEqual(games[2].created_at, "2026-01-01 10:20:15");
    });

    it("не должен создавать игру из пустой новой колонки", async () => {
      const { matchId } = await seedUnfinishedMatch();
      await gameService.create(matchId, "15", null, "2026-01-01 10:00:00");

      await gameService.applyMatchGames(matchId, [
        {lost_1_by: null, lost_2_by: null},
      ]);

      assert.strictEqual(gamesOf(matchId).length, 1);
    });

    it("должен снять finished у матча 2:0 после удаления игры (каскадный пересчёт)", async () => {
      const { matchId } = await seedUnfinishedMatch();
      const g1 = await gameService.create(matchId, null, "15", "2026-01-01 10:00:00") as { id: number };
      await gameService.create(matchId, null, "18", "2026-01-01 10:10:00");
      assert.strictEqual(db.get<{finished: number}>("SELECT finished FROM match WHERE id = ?", [matchId])!.finished, 1);

      await gameService.applyMatchGames(matchId, [
        {id: g1.id, lost_1_by: null, lost_2_by: null},
      ]);
      await flushRecalc();

      assert.strictEqual(db.get<{finished: number}>("SELECT finished FROM match WHERE id = ?", [matchId])!.finished, 0);
    });
  });
});
