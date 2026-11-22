import assert from "node:assert/strict";
import { describe, beforeEach, after, it } from "node:test";
import Express, { type Express as App } from "express";
import GameRouter from "../../src/routes/game.ts";
import MatchRouter from "../../src/routes/match.ts";
import UserRouter from "../../src/routes/user.ts";
import TeamRouter from "../../src/routes/team.ts";
import promiseMiddleware from "../../src/middleware/promise.ts";
import Repository from "../../src/repositories/common.ts";
import Match110Repository from "../../src/repositories/match110.ts";
import Game110Repository from "../../src/repositories/game110.ts";
import TeamService from "../../src/services/team.ts";
import TeamUserService from "../../src/services/team-user.ts";
import UserService from "../../src/services/user.ts";
import { clean } from "../helpers/migration.ts";
import type { AddressInfo } from "node:net";

const app: App = Express();
app.use(Express.json());
app.use(promiseMiddleware());
app.use((req, _res, next) => {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: number } }).user = { id: 1 };
  next();
});
app.use("/api/games", GameRouter);
app.use("/api/matches", MatchRouter);
app.use("/api/users", UserRouter);
app.use("/api/teams", TeamRouter);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/games`;
const matchesBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/matches`;
const usersBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users`;
const teamsBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/teams`;
const db = new Repository().db;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = async (path: string, body?: unknown) => fetch(path, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: body ? JSON.stringify(body) : undefined,
});

// матч двух пар, зарегистрированных на текущий турнир
const seedMatch = async (): Promise<number> => {
  const ids: number[] = [];
  for (const [ln, fn] of [["Тестов", "Алексей"], ["Смирнов", "Борис"], ["Кузнецова", "Вера"], ["Попов", "Григорий"]]) {
    const res = await post(`${usersBase}/create`, {ln, fn, pn: "Отчество", rate: 500, sex: "on", city: 1, bd: "1990-01-01"});
    ids.push(((await res.json()) as { id: number }).id);
  }
  await post(`${usersBase}/register/${ids.join(",")}`);
  const created = await (await post(`${matchesBase}/create`, {
    user_1_id: ids[0], user_2_id: ids[1], user_3_id: ids[2], user_4_id: ids[3],
  })).json() as { id: number };
  return created.id;
};

describe("Game routes", () => {
  beforeEach(async () => {
    await clean();
  });

  describe("current110 serve/swap/type-pos (live-табло 110)", () => {
    // матч 110 двух команд по HTTP: пользователи, регистрация, команды,
    // составы, матч, игра строки
    const seedMatch110 = async (): Promise<{ team1: number; team2: number; matchId: number }> => {
      const ids: number[] = [];
      for (let i = 1; i <= 4; i++) {
        const res = await post(`${usersBase}/create`, {
          ln: `Игрок${i}`, fn: `Имя${i}`, pn: "Отчество", rate: 500,
          sex: i % 2 === 1 ? "on" : "off", city: 1, bd: "1990-01-01",
        });
        ids.push(((await res.json()) as { id: number }).id);
      }
      await post(`${usersBase}/register/${ids.join(",")}`);
      const team1 = ((await (await post(`${teamsBase}/create`, {
        tournament_id: 1, group_id: 1, name: "Команда 1", city_id: 1, team_color_id: 1,
      })).json()) as { id: number }).id;
      const team2 = ((await (await post(`${teamsBase}/create`, {
        tournament_id: 1, group_id: 1, name: "Команда 2", city_id: 1, team_color_id: 2,
      })).json()) as { id: number }).id;
      for (const [teamId, pair] of [[team1, ids.slice(0, 2)], [team2, ids.slice(2)]]) {
        for (const userId of pair) {
          await post(`${teamsBase}/users/create`, {team_id: teamId, user_id: userId, group_id: 1});
        }
      }
      const matchId = ((await (await post(`${matchesBase}/create110`, {
        team_1_id: team1, team_2_id: team2,
      })).json()) as { id: number }).id;
      await post(`${base}/create110/${matchId}`);
      return {team1, team2, matchId};
    };

    it("POST /current110/serve задаёт подачу чётному игроку на 0:0", async () => {
      const {team1, team2, matchId} = await seedMatch110();
      db.run("UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?", [matchId]);
      const roster = db.all<{ user_id: number }>(
          `SELECT user_id FROM team_user WHERE team_id = ? ORDER BY id`, [team1]);
      const even = roster[0].user_id;

      const res = await post(`${base}/current110/serve?team_1_id=${team1}&team_2_id=${team2}&user_id=${even}`);
      assert.strictEqual(res.status, 200);
      const state = await res.json() as { serve_user_id: number; game_type_pos: number };
      assert.strictEqual(state.serve_user_id, even);
      assert.strictEqual(state.game_type_pos, 4);

      // не-чётный игрок — отказ (пустое тело)
      const other = roster[1].user_id;
      const denied = await post(`${base}/current110/serve?team_1_id=${team1}&team_2_id=${team2}&user_id=${other}`);
      assert.strictEqual(await denied.text(), "");
    });

    it("POST /current110/swap меняет чётность пары в начале партии (0:0)", async () => {
      const {team1, team2, matchId} = await seedMatch110();
      db.run("UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?", [matchId]);
      const roster = db.all<{ user_id: number }>(
          `SELECT user_id FROM team_user WHERE team_id = ? ORDER BY id`, [team1]);
      const [even, other] = roster.map(r => r.user_id);
      await post(`${base}/current110/serve?team_1_id=${team1}&team_2_id=${team2}&user_id=${even}`);

      const res = await post(`${base}/current110/swap?team_1_id=${team1}&team_2_id=${team2}&team_number=1`);
      assert.strictEqual(res.status, 200);
      const state = await res.json() as { even_1_user_id: number; serve_user_id: number };
      assert.strictEqual(state.even_1_user_id, other);
      // 0:0 — чётный корт, подача остаётся у чётного (после свапа это other)
      assert.strictEqual(state.serve_user_id, other);
    });

    it("POST /current110/swap после первого очка партии — отказ, после type-pos — снова разрешён", async () => {
      const {team1, team2, matchId} = await seedMatch110();
      db.run("UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?", [matchId]);
      const roster = db.all<{ user_id: number }>(
          `SELECT user_id FROM team_user WHERE team_id = ? ORDER BY id`, [team1]);
      const [even, other] = roster.map(r => r.user_id);

      // первое очко партии — свап запрещён
      await post(`${base}/current110/increase?team_1_id=${team1}&team_2_id=${team2}&team_number=1`);
      const denied = await post(`${base}/current110/swap?team_1_id=${team1}&team_2_id=${team2}&team_number=1`);
      assert.strictEqual(await denied.text(), "");

      // 11:0 — граница партии, type-pos оформляет старт следующей (СП
      // круга 2 — парный ростер): свап снова разрешён
      for (let i = 1; i < 11; i++) {
        await post(`${base}/current110/increase?team_1_id=${team1}&team_2_id=${team2}&team_number=1`);
      }
      const tpState = await (await post(`${base}/current110/type-pos?team_1_id=${team1}&team_2_id=${team2}&type_pos=9`)).json() as { even_1_user_id: number };
      const res = await post(`${base}/current110/swap?team_1_id=${team1}&team_2_id=${team2}&team_number=1`);
      assert.strictEqual(res.status, 200);
      const state = await res.json() as { even_1_user_id: number };
      // чётность переехала на второго игрока ростера
      assert.strictEqual(state.even_1_user_id, roster.map(r => r.user_id).find(id => id !== tpState.even_1_user_id));
    });

    it("POST /current110/swap без team_number — отказ (пустое тело)", async () => {
      const {team1, team2} = await seedMatch110();
      const res = await post(`${base}/current110/swap?team_1_id=${team1}&team_2_id=${team2}`);
      assert.strictEqual(await res.text(), "");
    });

    it("POST /current110/type-pos меняет разряд на границе и наследует половины", async () => {
      const {team1, team2, matchId} = await seedMatch110();
      db.run("UPDATE game_110 SET game_type_pos = 4 WHERE match_110_id = ?", [matchId]);
      for (let i = 0; i < 11; i++) {
        await post(`${base}/current110/increase?team_1_id=${team1}&team_2_id=${team2}&team_number=1`);
      }

      const res = await post(`${base}/current110/type-pos?team_1_id=${team1}&team_2_id=${team2}&type_pos=5`);
      assert.strictEqual(res.status, 200);
      const state = await res.json() as { game_type_pos: number; score_1: number };
      assert.strictEqual(state.game_type_pos, 5);
      assert.strictEqual(state.score_1, 11);

      // вне границы — отказ: 12:5 (никакая сторона не кратна 11)
      await post(`${base}/current110/increase?team_1_id=${team1}&team_2_id=${team2}&team_number=1`);
      const denied = await post(`${base}/current110/type-pos?team_1_id=${team1}&team_2_id=${team2}&type_pos=6`);
      assert.strictEqual(await denied.text(), "");
    });
  });

  describe("POST /create, GET /:id", () => {
    it("должен создать гейм и вернуть его по id", async () => {
      const matchId = await seedMatch();

      const created = await (await post(`${base}/create`, {
        match_id: matchId, lost_1_by: "15", lost_2_by: null, created_at: "2026-01-01 10:00:00",
      })).json() as { id: number };

      const game = await (await fetch(`${base}/${created.id}`)).json() as {
        id: number;
        match_id: number;
        lost_1_by: number;
        lost_2_by: null;
      };

      assert.strictEqual(game.match_id, matchId);
      assert.strictEqual(game.lost_1_by, 15);
      assert.strictEqual(game.lost_2_by, null);
    });
  });

  describe("POST /create (вторая игра)", () => {
    it("должен завершить матч двумя проигранными геймами", async () => {
      const matchId = await seedMatch();

      await post(`${base}/create`, {match_id: matchId, lost_1_by: "15", lost_2_by: null, created_at: "2026-01-01 10:00:00"});
      await post(`${base}/create`, {match_id: matchId, lost_1_by: "17", lost_2_by: null, created_at: "2026-01-01 10:05:00"});

      assert.strictEqual(db.get<{ finished: number }>("SELECT finished FROM match WHERE id = ?", [matchId])!.finished, 1);

      const unfinished = await (await fetch(`${matchesBase}/unfinished`)).json();
      assert.deepStrictEqual(unfinished, []);
    });
  });

  describe("POST /bulk/:match_id (редактирование матча из истории)", () => {
    it("должен применить пачку игр к матчу", async () => {
      const matchId = await seedMatch();
      const g1 = ((await (await post(`${base}/create`, {
        match_id: matchId, lost_1_by: "15", lost_2_by: null, created_at: "2026-01-01 10:00:00",
      })).json()) as { id: number }).id;
      const g2 = ((await (await post(`${base}/create`, {
        match_id: matchId, lost_1_by: "18", lost_2_by: null, created_at: "2026-01-01 10:10:00",
      })).json()) as { id: number }).id;

      const res = await post(`${base}/bulk/${matchId}`, {
        games: [
          {id: g1, lost_1_by: "8", lost_2_by: null},
          {id: g2, lost_1_by: null, lost_2_by: null},
          {lost_1_by: null, lost_2_by: "19"},
        ],
      });
      assert.strictEqual(res.status, 200);

      const games = db.all<{id: number; lost_1_by: number | null; lost_2_by: number | null}>(
          "SELECT id, lost_1_by, lost_2_by FROM game WHERE match_id = ? ORDER BY created_at, id", [matchId]);
      // очищенная g2 удалена, новая создана с новым id
      assert.deepStrictEqual(games.map(g => [g.id, g.lost_1_by, g.lost_2_by]), [
        [g1, 8, null],
        [games[1].id, null, 19],
      ]);
    });
  });

  describe("GET /110/standings", () => {
    it("возвращает сводную таблицу 110 турнира", async () => {
      const match110 = new Match110Repository();
      const game110 = new Game110Repository();
      const teamService = new TeamService();
      const teamUserService = new TeamUserService();
      const userService = new UserService();
      const seedTeam = async (name: string, rating: number, color: number): Promise<number> => {
        const { id: userId } = await userService.create(name, "Игрок", "Отчество", 500, 1, 1, "1990-01-01");
        db.run(`INSERT INTO user_lab (user_id, rating_1) VALUES (?, ?)`, [userId, rating]);
        const { id: teamId } = teamService.create(4, 1, name, 1, color);
        teamUserService.create(teamId, userId, 1);
        return teamId;
      };
      const a = await seedTeam("А", 100, 1);
      const b = await seedTeam("Б", 90, 2);
      const c = await seedTeam("В", 80, 3);
      const play = (x: number, y: number, sx: number, sy: number): void => {
        const { id } = match110.create(x, y, 4);
        game110.create(id);
        db.run(`UPDATE game_110 SET score_1 = ?, score_2 = ? WHERE match_110_id = ?`, [sx, sy, id]);
        db.run(`UPDATE match_110 SET finished = 1 WHERE id = ?`, [id]);
      };
      play(a, b, 110, 80);
      play(b, c, 110, 70);
      play(c, a, 110, 90);

      const res = await fetch(`${base}/110/standings?tournament=4`);
      assert.strictEqual(res.status, 200);
      const rows = await res.json() as { team_id: number; points: number; diff: number }[];
      assert.deepStrictEqual(rows.map(r => r.team_id), [a, b, c]);
      assert.deepStrictEqual(rows.map(r => [r.points, r.diff]), [[1, 10], [1, 10], [1, -20]]);
    });
  });
});
