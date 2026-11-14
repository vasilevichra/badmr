import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Game {
  declare static _instance: Game | undefined;
  db!: DB;

  constructor() {
    if (Game._instance) {
      return Game._instance;
    }
    Game._instance = this;

    this.db = new Repository().db;
  }

  getById(id: number) {
    return this.db.get(
        `SELECT *
         FROM game
         WHERE id = ?`,
        [id]
    );
  }

  getAllByMatchId(match_id: number) {
    return this.db.all(
        `SELECT *
         FROM game
         WHERE match_id = ?
         ORDER BY created_at, id`,
        [match_id]
    );
  }

  /** Текущая (идущая) игра матча для живого табло Новой лиги + счёт
   *  по играм (wins_X — число записанных игр: game-строки с lost_X_by —
   *  очки проигравшей стороны). Номер текущей игры клиент считает
   *  как wins_1 + wins_2 + 1. Идущей игры нет (начало матча или пауза
   *  между играми) — возвращаем «виртуальную» следующую: 0:0, чётность —
   *  база (первый в паре), подача — чётный игрок победителя последней
   *  записанной игры (в первом матче не задана) — чтобы табло и после
   *  переоткрытия показывало номер игры и воланчик между играми. */
  getCurrentByMatchId(match_id: number) {
    const g = this.db.get<{
      id: number, match_id: number, created_at: string,
      lost_1_by: number | null, lost_2_by: number | null,
      score_1: number, score_2: number, current: number,
      serve_user_id: number | null, even_1_user_id: number | null, even_2_user_id: number | null,
      wins_1: number, wins_2: number
    }>(
        `SELECT g.*,
                (SELECT count(*) FROM game WHERE match_id = g.match_id AND lost_2_by IS NOT NULL) AS wins_1,
                (SELECT count(*) FROM game WHERE match_id = g.match_id AND lost_1_by IS NOT NULL) AS wins_2
         FROM game g
         WHERE g.match_id = ? AND g.current = 1
         ORDER BY g.id DESC
         LIMIT 1`,
        [match_id]
    );
    if (g) return g;
    return this.db.get<{
      id: number, match_id: number, created_at: string,
      lost_1_by: number | null, lost_2_by: number | null,
      score_1: number, score_2: number, current: number,
      serve_user_id: number | null, even_1_user_id: number | null, even_2_user_id: number | null,
      wins_1: number, wins_2: number
    }>(
        `SELECT NULL AS id, m.id AS match_id, NULL AS created_at,
                NULL AS lost_1_by, NULL AS lost_2_by,
                0 AS score_1, 0 AS score_2, 0 AS current,
                CASE
                  WHEN (SELECT count(*) FROM game WHERE match_id = m.id) = 0 THEN NULL
                  WHEN (SELECT lost_2_by FROM game WHERE match_id = m.id ORDER BY id DESC LIMIT 1) IS NOT NULL THEN m.user_1_id
                  ELSE m.user_3_id
                END AS serve_user_id,
                m.user_1_id AS even_1_user_id,
                m.user_3_id AS even_2_user_id,
                (SELECT count(*) FROM game WHERE match_id = m.id AND lost_2_by IS NOT NULL) AS wins_1,
                (SELECT count(*) FROM game WHERE match_id = m.id AND lost_1_by IS NOT NULL) AS wins_2
         FROM match m
         WHERE m.id = ?`,
        [match_id]
    );
  }

  /** Счёт текущей игры после изменения + прогресс матча: сколько игр
   *  записано за каждую сторону (game-строки с lost_X_by — очки
   *  проигравшей стороны, значит победа за противоположной). */
  private state(match_id: number, g: { score_1: number, score_2: number }) {
    const wins = this.db.get<{ wins_1: number, wins_2: number }>(
        `SELECT (SELECT count(*) FROM game WHERE match_id = ? AND lost_2_by IS NOT NULL) AS wins_1,
                (SELECT count(*) FROM game WHERE match_id = ? AND lost_1_by IS NOT NULL) AS wins_2`,
        [match_id, match_id]
    )!;
    return {...g, ...wins, game_over: false, winner: null, lost_by: null, match_over: false};
  }

  /** +1 очко стороне команды team_number в текущей игре матча Новой лиги.
   *  Идущей игры нет (первая или следующая после завершённой) — создаём.
   *  Конец игры — по правилам бадминтона: при game_point == max_point
   *  игры без баланса — первый достигший game_point; иначе игра идёт до
   *  max_point либо до разницы в 2 очка после game_point. Завершённая
   *  игра записывается (lost_X_by — очки проигравшей стороны, current = 0),
   *  матч завершается автоматически при двух победах одной из сторон.
   *  Подача и чётность кортов: при создании игры чётность сбрасывается
   *  к базе (первый в паре — чётный), подача между играми — чётный игрок
   *  победителя предыдущей игры (в первой игре подачу задаёт судья
   *  двойным кликом на 0:0 — см. setCurrentServeByMatchId); при очке
   *  подающая пара меняется кортами, подающий — игрок победившей пары
   *  в корте, соответствующем чётности её счёта. */
  increaseCurrentByMatchId(match_id: number, team_number: string, game_point: number, max_point: number) {
    const match = this.db.get<{ id: number, finished: number, user_1_id: number, user_2_id: number, user_3_id: number, user_4_id: number }>(
        `SELECT id, finished, user_1_id, user_2_id, user_3_id, user_4_id FROM match WHERE id = ?`,
        [match_id]
    );
    // матча нет или он уже завершён — инкремента нет
    if (!match || match.finished) return null;
    const roster = {1: [match.user_1_id, match.user_2_id], 2: [match.user_3_id, match.user_4_id]};
    const otherPlayer = (team: 1 | 2, id: number) => roster[team].find(p => p !== id)!;
    let g = this.getCurrentByMatchId(match_id);
    if (!g || g.id === null) {
      // новая игра: чётность — база (первый в паре — чётный); подача —
      // чётный игрок победителя последней записанной игры, а в первой
      // игре матча подача не задана (её выставит судья двойным кликом)
      this.db.run(
          `INSERT INTO game (match_id, current, even_1_user_id, even_2_user_id, serve_user_id)
           VALUES (?, 1, ?, ?, (
             SELECT CASE
               WHEN (SELECT count(*) FROM game WHERE match_id = ? AND current = 0) = 0 THEN NULL
               WHEN (SELECT lost_2_by FROM game WHERE match_id = ? AND current = 0 ORDER BY id DESC LIMIT 1) IS NOT NULL THEN ?
               ELSE ?
             END))`,
          [match_id, match.user_1_id, match.user_3_id, match_id, match_id, match.user_1_id, match.user_3_id]
      );
      g = this.getCurrentByMatchId(match_id);
    }
    const winner = (team_number === "1" ? 1 : 2) as 1 | 2;
    // чётность кортов до очка (null — база), подача до очка
    const even = {1: g!.even_1_user_id ?? match.user_1_id, 2: g!.even_2_user_id ?? match.user_3_id};
    const servingTeam = g!.serve_user_id
        ? ((g!.serve_user_id === roster[1][0] || g!.serve_user_id === roster[1][1]) ? 1 : 2)
        : null;
    this.db.run(
        `UPDATE game
         SET score_${winner} = score_${winner} + 1
         WHERE id = ?`,
        [g!.id]
    );
    const updated = this.db.get<{ score_1: number, score_2: number }>(
        `SELECT score_1, score_2 FROM game WHERE id = ?`,
        [g!.id]
    )!;
    // подача после очка: подающая пара меняется кортами (выиграла очко
    // на своей подаче); подающий — игрок пары-победителя в корте,
    // соответствующем чётности её нового счёта. Пара, проигравшая розыгрыш,
    // корты не меняет. Подача не задана (первый розыгрыш до двойного
    // клика) — считаем, что очко выиграно на приёме: без смены кортов
    if (servingTeam === winner) even[winner] = otherPlayer(winner, even[winner]);
    const serverUser = updated[`score_${winner}`] % 2 === 0 ? even[winner] : otherPlayer(winner, even[winner]);
    this.db.run(
        `UPDATE game
         SET serve_user_id = ?, even_1_user_id = ?, even_2_user_id = ?
         WHERE id = ?`,
        [serverUser, even[1], even[2], g!.id]
    );
    const winnerScore = updated[`score_${winner}`];
    const loserScore = updated[`score_${winner === 1 ? 2 : 1}`];
    const gameOver = game_point === max_point
        ? winnerScore >= game_point
        : winnerScore >= max_point || (winnerScore >= game_point && winnerScore - loserScore >= 2);
    if (!gameOver) {
      return this.state(match_id, this.getCurrentByMatchId(match_id)!);
    }
    // конец игры: очки проигравшего — в lost_X_by, игра больше не текущая
    const loser = winner === 1 ? "2" : "1";
    this.db.run(
        `UPDATE game
         SET current = 0, lost_${loser}_by = ?
         WHERE id = ?`,
        [loserScore, g!.id]
    );
    // матч: до двух побед одной из сторон
    const wins = this.db.get<{ wins_1: number, wins_2: number }>(
        `SELECT (SELECT count(*) FROM game WHERE match_id = ? AND lost_2_by IS NOT NULL) AS wins_1,
                (SELECT count(*) FROM game WHERE match_id = ? AND lost_1_by IS NOT NULL) AS wins_2`,
        [match_id, match_id]
    )!;
    const match_over = wins.wins_1 >= 2 || wins.wins_2 >= 2;
    if (match_over) {
      this.db.run(
          `UPDATE match SET finished = 1 WHERE id = ?`,
          [match_id]
      );
    }
    // следующая игра начнётся с базы чётности и подачи победителя —
    // возвращаем её клиенту, чтобы воланчик на 0:0 был виден сразу
    return {
      ...updated,
      ...wins,
      game_over: true,
      winner,
      lost_by: loserScore,
      match_over,
      serve_user_id: match_over ? null : winner === 1 ? match.user_1_id : match.user_3_id,
      even_1_user_id: match.user_1_id,
      even_2_user_id: match.user_3_id
    };
  }

  /** −1 очко (корректировка судьёй): только у идущей игры, счёт не ниже 0.
   *  Подача и чётность откатываются по эвристике «очко выиграно подачей»:
   *  если уменьшаем счёт подающей пары — считаем, что она выиграла очко
   *  на своей подаче (возвращаем смену кортов и подающего по чётности
   *  нового счёта); если другой — считаем, что она выиграла на приёме
   *  (подача возвращается к бывшей подающей паре без смены кортов). */
  decreaseCurrentByMatchId(match_id: number, team_number: string) {
    const match = this.db.get<{ id: number, user_1_id: number, user_2_id: number, user_3_id: number, user_4_id: number }>(
        `SELECT id, user_1_id, user_2_id, user_3_id, user_4_id FROM match WHERE id = ?`,
        [match_id]
    );
    if (!match) return null;
    const roster = {1: [match.user_1_id, match.user_2_id], 2: [match.user_3_id, match.user_4_id]};
    const otherPlayer = (team: 1 | 2, id: number) => roster[team].find(p => p !== id)!;
    const g = this.getCurrentByMatchId(match_id);
    if (!g || g.id === null) return null;
    const scorer = (team_number === "1" ? 1 : 2) as 1 | 2;
    this.db.run(
        `UPDATE game
         SET score_${scorer} = score_${scorer} - 1
         WHERE id = ? AND score_${scorer} > 0`,
        [g.id]
    );
    const updated = this.db.get<{ score_1: number, score_2: number }>(
        `SELECT score_1, score_2 FROM game WHERE id = ?`,
        [g.id]
    )!;
    // уменьшать было нечего (счёт уже 0): очка не было — подачу и чётность
    // не откатываем, иначе повторный свайп вниз на 0:0 свапнет пару
    if (updated[`score_${scorer}`] === g[`score_${scorer}`]) {
      return this.state(match_id, g);
    }
    // подача и чётность до корректировки (null — база/не задана)
    const even = {1: g.even_1_user_id ?? match.user_1_id, 2: g.even_2_user_id ?? match.user_3_id};
    const servingTeam = g.serve_user_id
        ? ((g.serve_user_id === roster[1][0] || g.serve_user_id === roster[1][1]) ? 1 : 2)
        : null;
    let serverUser = g.serve_user_id;
    if (servingTeam !== null) {
      if (servingTeam === scorer) {
        // откатываем смену кортов подающей пары: подающий — игрок пары
        // в корте, соответствующем чётности её нового счёта
        even[scorer] = otherPlayer(scorer, even[scorer]);
        serverUser = updated[`score_${scorer}`] % 2 === 0 ? even[scorer] : otherPlayer(scorer, even[scorer]);
      } else {
        // очко на приёме: подача возвращается к бывшей подающей паре,
        // корты не менялись — подающий по чётности её (неизменного) счёта
        serverUser = updated[`score_${servingTeam}`] % 2 === 0 ? even[servingTeam] : otherPlayer(servingTeam, even[servingTeam]);
      }
    }
    this.db.run(
        `UPDATE game
         SET serve_user_id = ?, even_1_user_id = ?, even_2_user_id = ?
         WHERE id = ?`,
        [serverUser, even[1], even[2], g.id]
    );
    return this.state(match_id, this.getCurrentByMatchId(match_id)!);
  }

  /** Задать первого подающего: двойной клик/тап судьи по чётному игроку
   *  на 0:0. Только для первой игры матча (записанных игр ещё нет) и
   *  только чётному игроку пары — в последующих играх подача и так
   *  назначается чётному игроку победителя предыдущей автоматически.
   *  Игра при отсутствии создаётся (чётность базы, подача не задана). */
  setCurrentServeByMatchId(match_id: number, user_id: number) {
    const match = this.db.get<{ id: number, finished: number, user_1_id: number, user_2_id: number, user_3_id: number, user_4_id: number }>(
        `SELECT id, finished, user_1_id, user_2_id, user_3_id, user_4_id FROM match WHERE id = ?`,
        [match_id]
    );
    if (!match || match.finished) return null;
    if (![match.user_1_id, match.user_2_id, match.user_3_id, match.user_4_id].includes(user_id)) return null;
    // только первая игра матча: записанных (завершённых) игр ещё нет
    const played = this.db.get<{ n: number }>(
        `SELECT count(*) AS n FROM game WHERE match_id = ? AND current = 0`,
        [match_id]
    )!.n;
    if (played > 0) return null;
    let g = this.getCurrentByMatchId(match_id);
    if (!g || g.id === null) {
      // новой игре чётность — база, подача ещё не задана
      this.db.run(
          `INSERT INTO game (match_id, current, even_1_user_id, even_2_user_id, serve_user_id)
           VALUES (?, 1, ?, ?, NULL)`,
          [match_id, match.user_1_id, match.user_3_id]
      );
      g = this.getCurrentByMatchId(match_id);
    }
    if (g!.score_1 !== 0 || g!.score_2 !== 0) return null;
    // подача выставляется только чётному игроку пары
    const even = {1: g!.even_1_user_id ?? match.user_1_id, 2: g!.even_2_user_id ?? match.user_3_id};
    if (user_id !== even[1] && user_id !== even[2]) return null;
    this.db.run(
        `UPDATE game SET serve_user_id = ? WHERE id = ?`,
        [user_id, g!.id]
    );
    return this.getCurrentByMatchId(match_id);
  }

  /** Ручной свап чётности кортов пары (судья свайпом по игроку): игроки
   *  пары меняются кортами — even_X_user_id становится напарник.
   *  Только при 0:0 (коррекция стартовой расстановки). Если подаёт игрок
   *  свапаемой пары, подача переезжает на корт по чётности счёта пары.
   *  Игра при отсутствии создаётся (чётность базы, подача не задана). */
  swapCurrentEvenByMatchId(match_id: number, team_number: string) {
    const match = this.db.get<{ id: number, finished: number, user_1_id: number, user_2_id: number, user_3_id: number, user_4_id: number }>(
        `SELECT id, finished, user_1_id, user_2_id, user_3_id, user_4_id FROM match WHERE id = ?`,
        [match_id]
    );
    if (!match || match.finished) return null;
    const team = (team_number === "1" ? 1 : 2) as 1 | 2;
    const roster = {1: [match.user_1_id, match.user_2_id], 2: [match.user_3_id, match.user_4_id]};
    let g = this.getCurrentByMatchId(match_id);
    // свап чётности — коррекция стартовой расстановки, только при 0:0:
    // при идущем счёте чётность и подача определяются очками, ручной
    // перенос сломал бы инвариант «подаёт по чётности счёта»
    if (g && g.id !== null && (g.score_1 !== 0 || g.score_2 !== 0)) return null;
    if (!g || g.id === null) {
      this.db.run(
          `INSERT INTO game (match_id, current, even_1_user_id, even_2_user_id, serve_user_id)
           VALUES (?, 1, ?, ?, NULL)`,
          [match_id, match.user_1_id, match.user_3_id]
      );
      g = this.getCurrentByMatchId(match_id);
    }
    const even = (team === 1 ? g!.even_1_user_id : g!.even_2_user_id) ?? roster[team][0];
    const other = roster[team].find(p => p !== even)!;
    this.db.run(
        `UPDATE game SET even_${team}_user_id = ? WHERE id = ?`,
        [other, g!.id]
    );
    // подаёт игрок этой пары — после смены кортов подача переходит на
    // корт по чётности счёта пары: при 0:0 подаёт только чётный игрок
    // (чётный корт), при нечётном счёте — нечётный; пары подачи не трогаем
    const serveTeam = g!.serve_user_id ? (roster[1].includes(g!.serve_user_id) ? 1 : 2) : null;
    if (serveTeam === team) {
      const teamScore = team === 1 ? g!.score_1 : g!.score_2;
      const serverUser = teamScore % 2 === 0 ? other : even;
      this.db.run(
          `UPDATE game SET serve_user_id = ? WHERE id = ?`,
          [serverUser, g!.id]
      );
    }
    return this.state(match_id, this.getCurrentByMatchId(match_id)!);
  }

  create(match_id: number, lost_1_by: string | null, lost_2_by: string | null, created_at: string) {
    // время приходит из печенек клиента (момент ввода счёта) и может быть
    // старше уже записанных игр матча: длительности в истории матчей
    // считаются разностями created_at соседних игр, инверсия перемешивает
    // их начало/окончание — поэтому не даём времени уходить в прошлое
    return this.db.run(
        `INSERT INTO game (match_id,
                           lost_1_by,
                           lost_2_by,
                           created_at)
         VALUES (?, ?, ?, max(?, (SELECT coalesce(max(created_at), ?) FROM game WHERE match_id = ?)))`,
        [match_id, lost_1_by, lost_2_by, created_at, created_at, match_id]
    );
  }

  update(id: number, lost_1_by: string | null, lost_2_by: string | null) {
    return this.db.run(
        `UPDATE game
         SET lost_1_by = ?,
             lost_2_by = ?
         WHERE id = ?`,
        [lost_1_by, lost_2_by, id]
    );
  }

  deleteById(id: number) {
    return this.db.run(
        `DELETE FROM game WHERE id = ?`,
        [id]
    );
  }
}

export default Game;