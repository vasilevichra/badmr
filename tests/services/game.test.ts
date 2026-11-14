import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";
import GameService from "../../src/services/game.ts";
import Game110Repository from "../../src/repositories/game110.ts";
import MatchService from "../../src/services/match.ts";
import TeamService from "../../src/services/team.ts";
import TeamOrderService from "../../src/services/team-order.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

interface GameRow {
  id: number;
  match_id: number;
  lost_1_by: number | null;
  lost_2_by: number | null;
  // живое табло Новой лиги: счёт текущей игры (current = 1)
  score_1: number;
  score_2: number;
  current: number;
  // чётность кортов и подача (live-табло Новой лиги)
  serve_user_id: number | null;
  even_1_user_id: number | null;
  even_2_user_id: number | null;
  created_at: string;
}

interface Game110Row {
  id: number;
  match_110_id: number;
  game_type_id: number;
  score_1: number;
  score_2: number;
  current: number;
  // чётность кортов, подача и индекс разряда (live-табло 110)
  serve_user_id: number | null;
  even_1_user_id: number | null;
  even_2_user_id: number | null;
  game_type_pos: number;
}

const gameService = new GameService();
const game110Repository = new Game110Repository();
const matchService = new MatchService();
const teamService = new TeamService();
const teamOrderService = new TeamOrderService();
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

// создаёт две команды с двумя игроками в каждой и матч 110 между ними.
// Пол чередуется (м+ж в каждой команде): аватары парных разрядов
// (СП = м+ж) резолвятся фолбэком «сильнейший подходящего пола»
const seedMatch110 = async (): Promise<{ team1: number; team2: number; match110Id: number }> => {
  const ids: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const { id } = await userService.create(`Игрок${i}`, `Имя${i}`, "Отчество", 500, i % 2 === 1 ? 1 : 0, 1, "1990-01-01");
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
        score_1: 0,
        score_2: 0,
        current: 0,
        serve_user_id: null,
        even_1_user_id: null,
        even_2_user_id: null,
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

  describe("swapCurrentEvenByMatchId", () => {
    it("должен поменять чётность пары при 0:0", async () => {
      const { ids, matchId } = await seedUnfinishedMatch();

      const result = await gameService.swapCurrentEvenByMatchId(matchId, "1") as { even_1_user_id: number };

      assert.strictEqual(result.even_1_user_id, ids[1]);
    });

    it("не должен менять чётность при ненулевом счёте", async () => {
      const { ids, matchId } = await seedUnfinishedMatch();
      await gameService.increaseCurrentByMatchId(matchId, "1");

      const result = await gameService.swapCurrentEvenByMatchId(matchId, "1");
      const game = await gameService.getCurrentByMatchId(matchId) as { even_1_user_id: number | null };

      assert.strictEqual(result, null);
      assert.strictEqual(game.even_1_user_id, ids[0]);
    });
  });

    it("должен вернуть пустой ответ когда матча между командами нет", async () => {
      assert.strictEqual(await gameService.getCurrentByTeamIds(1, 2), undefined);
    });
  });

  describe("decreaseCurrentByMatchId", () => {
    it("повторное уменьшение на 0:0 не свапает чётность (счёт не меняется — подачи и чётность не откатываются)", async () => {
      const { ids, matchId } = await seedUnfinishedMatch();
      await gameService.setCurrentServeByMatchId(matchId, ids[0]);
      await gameService.increaseCurrentByMatchId(matchId, "1");
      const after = await gameService.decreaseCurrentByMatchId(matchId, "1") as { even_1_user_id: number };

      // баг: счёт уже 0, UPDATE не срабатывает, но откат подачи/чётности
      // по эвристике «очко выиграно подачей» выполнялся — пара свапалась
      const again = await gameService.decreaseCurrentByMatchId(matchId, "1") as { even_1_user_id: number, score_1: number };

      assert.strictEqual(again.even_1_user_id, after.even_1_user_id);
      assert.strictEqual(again.score_1, 0);
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

    it("должен зачислить проигравшему партию минимум 5 очков (11-5)", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);

      for (let i = 0; i < 11; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");

      const game = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;
      assert.strictEqual(game.score_1, 11);
      assert.strictEqual(game.score_2, 5);
    });

    it("не должен трогать счёт проигравшего, набравшего за партию больше 5", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);

      for (let i = 0; i < 6; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "2");
      for (let i = 0; i < 11; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");

      const game = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;
      assert.strictEqual(game.score_1, 11);
      assert.strictEqual(game.score_2, 6);
    });

    it("во второй партии должен добрать проигравшему до 10 (22-10)", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);

      for (let i = 0; i < 22; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");

      const game = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;
      assert.strictEqual(game.score_1, 22);
      assert.strictEqual(game.score_2, 10);
    });

    it("при 110 очках должен завершить матч без автозачёта за последнюю партию (110-45)", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);

      for (let i = 0; i < 110; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");

      // матч завершён — getCurrentByTeamIds (фильтр finished = 0) уже не
      // находит игру, читаем счёт напрямую
      const game = await db.get<{ score_1: number, score_2: number }>(
          `SELECT score_1, score_2 FROM game_110 WHERE match_110_id = ?`,
          [match110Id]
      )!;
      assert.strictEqual(game.score_1, 110);
      assert.strictEqual(game.score_2, 45);
      const match = await db.get<{ finished: number }>(`SELECT finished FROM match_110 WHERE id = ?`, [match110Id]);
      assert.strictEqual(match!.finished, 1);
    });

    it("не должен увеличивать счёт после 110 очков", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);

      for (let i = 0; i < 110; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");
      await gameService.increaseCurrentByTeamIds(team1, team2, "1");
      await gameService.increaseCurrentByTeamIds(team1, team2, "2");

      const game = await db.get<{ score_1: number, score_2: number }>(
          `SELECT score_1, score_2 FROM game_110 WHERE match_110_id = ?`,
          [match110Id]
      )!;
      assert.strictEqual(game.score_1, 110);
      assert.strictEqual(game.score_2, 45);
    });
  });

  describe("increaseCurrentByTeamIds: чётность и подача (110)", () => {
    it("очко на своей подаче в одиночке: подающий остаётся сам", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      const p1 = (await teamOrderService.avatars(team1))["МО"][0];
      await gameService.setCurrentServeByTeamIds(team1, team2, p1.id);

      const r = await gameService.increaseCurrentByTeamIds(team1, team2, "1") as Game110Row;

      assert.strictEqual(r.score_1, 1);
      assert.strictEqual(r.serve_user_id, p1.id);
    });

    it("очко на своей подаче в паре: пара меняется кортами, подающий — по чётности счёта", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      // парный разряд: строка 4 = СП первого круга
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      const roster1 = (await teamOrderService.avatars(team1))["СП"]; // [чётный, напарник]
      await gameService.setCurrentServeByTeamIds(team1, team2, roster1[0].id);

      const r = await gameService.increaseCurrentByTeamIds(team1, team2, "1") as Game110Row;

      // счёт 1 нечётный → подающий — напарник нового чётного
      assert.strictEqual(r.even_1_user_id, roster1[1].id);
      assert.strictEqual(r.serve_user_id, roster1[0].id);
    });

    it("очко на приёме не меняет корты пары", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      const roster1 = (await teamOrderService.avatars(team1))["СП"];
      const roster2 = (await teamOrderService.avatars(team2))["СП"];
      await gameService.setCurrentServeByTeamIds(team1, team2, roster1[0].id);

      const r = await gameService.increaseCurrentByTeamIds(team1, team2, "2") as Game110Row;

      // счёт 2-й команды 1 (нечётный) → подающий — напарник чётного
      assert.strictEqual(r.serve_user_id, roster2[1].id);
      const g = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;
      assert.strictEqual(g.even_1_user_id, roster1[0].id);
      assert.strictEqual(g.even_2_user_id, roster2[0].id);
    });
  });

  describe("setCurrentServeByTeamIds (110)", () => {
    it("выставляет подачу чётному игроку на 0:0 и отказывает не-чётному и вне ростера", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      const roster1 = (await teamOrderService.avatars(team1))["СП"];

      const ok = await gameService.setCurrentServeByTeamIds(team1, team2, roster1[0].id) as Game110Row;
      assert.strictEqual(ok.serve_user_id, roster1[0].id);
      assert.strictEqual(await gameService.setCurrentServeByTeamIds(team1, team2, roster1[1].id), null);
      assert.strictEqual(await gameService.setCurrentServeByTeamIds(team1, team2, 999999), null);
    });

    it("отказывает при ненулевом счёте", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      await gameService.increaseCurrentByTeamIds(team1, team2, "1");
      const roster1 = (await teamOrderService.avatars(team1))["СП"];
      assert.strictEqual(await gameService.setCurrentServeByTeamIds(team1, team2, roster1[0].id), null);
    });
  });

  describe("decreaseCurrentByTeamIds: чётность и подача (110)", () => {
    it("повторное уменьшение до 0 не меняет состояние (счёт не изменился — не откатываем)", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      const roster1 = (await teamOrderService.avatars(team1))["СП"];
      await gameService.setCurrentServeByTeamIds(team1, team2, roster1[0].id);
      await gameService.increaseCurrentByTeamIds(team1, team2, "1");

      const after = await gameService.decreaseCurrentByTeamIds(team1, team2, "1");
      const again = await gameService.decreaseCurrentByTeamIds(team1, team2, "1");

      assert.deepStrictEqual(again, after);
    });

    it("уменьшение счёта на границе партии не трогает чётность и подачу", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      const roster1 = (await teamOrderService.avatars(team1))["СП"];
      await gameService.setCurrentServeByTeamIds(team1, team2, roster1[0].id);
      for (let i = 0; i < 11; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");
      const before = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;

      await gameService.decreaseCurrentByTeamIds(team1, team2, "1");

      const g = await gameService.getCurrentByTeamIds(team1, team2) as Game110Row;
      assert.strictEqual(g.score_1, 10);
      assert.strictEqual(g.even_1_user_id, before.even_1_user_id);
      assert.strictEqual(g.serve_user_id, before.serve_user_id);
    });

    it("уменьшение счёта подающей пары откатывает смену кортов и подачу", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      const roster1 = (await teamOrderService.avatars(team1))["СП"];
      await gameService.setCurrentServeByTeamIds(team1, team2, roster1[0].id);
      await gameService.increaseCurrentByTeamIds(team1, team2, "1");

      const r = await gameService.decreaseCurrentByTeamIds(team1, team2, "1") as Game110Row;

      assert.strictEqual(r.even_1_user_id, roster1[0].id);
      assert.strictEqual(r.serve_user_id, roster1[0].id);
    });
  });

  describe("swapCurrentEvenByTeamIds (110)", () => {
    it("меняет чётность пары на границе партии, подающий переезжает по чётности счёта", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      const roster1 = (await teamOrderService.avatars(team1))["СП"];
      await gameService.setCurrentServeByTeamIds(team1, team2, roster1[0].id);

      const r = await gameService.swapCurrentEvenByTeamIds(team1, team2, "1") as Game110Row;

      assert.strictEqual(r.even_1_user_id, roster1[1].id);
      // счёт 0:0 — чётный корт, подаёт новый чётный игрок
      assert.strictEqual(r.serve_user_id, roster1[1].id);
    });

    it("отказывает в середине партии (7:5)", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      for (let i = 0; i < 7; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");
      for (let i = 0; i < 5; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "2");
      assert.strictEqual(await gameService.swapCurrentEvenByTeamIds(team1, team2, "1"), null);
    });

    it("отказывает при 11:11 (оба счёта кратны 11 — не граница)", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      for (let i = 0; i < 11; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");
      for (let i = 0; i < 6; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "2");
      assert.strictEqual(await gameService.swapCurrentEvenByTeamIds(team1, team2, "1"), null);
    });
  });

  describe("setTypePosByTeamIds (110)", () => {
    it("наследует половины и назначает подачу победителю прошлой партии из нового ростера", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      db.run(`UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?`, [match110Id]);
      const sp1 = (await teamOrderService.avatars(team1))["СП"]; // [Игрок1, Игрок2]
      await gameService.setCurrentServeByTeamIds(team1, team2, sp1[0].id);
      // команда 1 закрывает партию 11:5 — победитель
      for (let i = 0; i < 11; i++) await gameService.increaseCurrentByTeamIds(team1, team2, "1");
      // судья свапнул чётность команды 1 в старом разряде
      await gameService.swapCurrentEvenByTeamIds(team1, team2, "1");

      // переход к следующему разряду (строка 1 = ЖО первого круга)
      const r = await gameService.setTypePosByTeamIds(team1, team2, 1) as Game110Row;

      const jo1 = (await teamOrderService.avatars(team1))["ЖО"];
      const jo2 = (await teamOrderService.avatars(team2))["ЖО"];
      // свапнутость наследуется: чётным в новой группе — второй игрок
      // (ЖО из одного игрока — он же второй в СП, тот же человек)
      assert.strictEqual(r.even_1_user_id, jo1[0].id);
      // база 2-й команды: первый (единственный) игрок группы
      assert.strictEqual(r.even_2_user_id, jo2[0].id);
      // подача: победитель (команда 1), её счёт 11 — нечётный корт;
      // в одиночном разряде подает сам игрок нового ростера
      assert.strictEqual(r.serve_user_id, jo1[0].id);
      assert.strictEqual(r.game_type_pos, 1);
    });

    it("отказывает вне границы партии", async () => {
      const { team1, team2, match110Id } = await seedMatch110();
      await gameService.create110(match110Id);
      await gameService.increaseCurrentByTeamIds(team1, team2, "1");
      assert.strictEqual(await gameService.setTypePosByTeamIds(team1, team2, 1), null);
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
