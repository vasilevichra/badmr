import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";
import TeamOrderRepository from './team-order.ts';

/** Порядок строк разрядов на табло (два круга через «•», разделитель
 *  не нумеруется): game_type_pos → группа разряда. Составы групп в
 *  кругах одинаковы. */
const BOARD_GROUPS = ['МО', 'ЖО', 'МП', 'ЖП', 'СП'] as const;

/** Состояние чётности/подачи табло 110 — ответ increase/decrease/
 *  serve/swap/type-pos для обновления маркеров клиентом. */
export interface Board110State {
  score_1: number;
  score_2: number;
  even_1_user_id: number | null;
  even_2_user_id: number | null;
  serve_user_id: number | null;
  game_type_pos: number;
}

/** Строка игры 110 с колонками чётности/подачи (live-табло). */
type Game110BoardRow = {
  id: number;
  score_1: number;
  score_2: number;
  match_110_id: number;
  even_1_user_id: number | null;
  even_2_user_id: number | null;
  serve_user_id: number | null;
  game_type_pos: number;
};

class Game110 {
  declare static _instance: Game110 | undefined;
  db!: DB;
  teamOrder!: TeamOrderRepository;

  constructor() {
    if (Game110._instance) {
      return Game110._instance;
    }
    Game110._instance = this;

    this.db = new Repository().db;
    this.teamOrder = new TeamOrderRepository();
  }

  getById(id: number) {
    return this.db.get(
        `SELECT *
         FROM game_110
         WHERE id = ?`,
        [id]
    );
  }

  /** Идущая игра матча пары. Без tournamentId — текущий турнир (мутации
   *  счёта всегда идут по нему); с id — указанный турнир (чтение со
   *  страниц архивных турниров). */
  getCurrentByTeamIds(teamId1: number, teamId2: number, tournamentId?: number) {
    const tournamentFilter = tournamentId ? 't.id = ?' : 't.current = 1';
    return this.db.get<{ id: number }>(
        `SELECT g.*
         FROM game_110 g
                  JOIN match_110 m on g.match_110_id = m.id
                  JOIN tournament t on t.id = m.tournament_id
         WHERE ${tournamentFilter}
           AND m.finished = 0
           AND m.team_1_id = ?
           AND m.team_2_id = ?
           AND g.current = 1
           -- по паре берём только последний матч (клик ▶ может
           -- насоздавать несколько матчей одной пары)
           AND m.id = (SELECT MAX(m2.id) FROM match_110 m2
                       WHERE m2.tournament_id = m.tournament_id
                         AND m2.team_1_id = m.team_1_id
                         AND m2.team_2_id = m.team_2_id)`,
        tournamentId ? [tournamentId, teamId1, teamId2] : [teamId1, teamId2]
    );
  }

  /** Счёты матчей 110 текущего турнира — счёт последней игры матча
   *  (для идущего матча она же текущая), с флагом финиша. Для показа
   *  в ячейках матрицы: финишировавший — только счёт, идущий —
   *  счёт + кнопка возобновления. По паре берём только последний
   *  матч (клик ▶ может насоздавать несколько матчей одной пары). */
  /** Счёты матчей 110 турнира (без параметра — текущего) для ячеек
   *  матрицы: по паре берём только последний матч (клик ▶ может
   *  насоздавать несколько матчей одной пары). */
  getResults(tournamentId?: number) {
    const tournamentFilter = tournamentId ? 't.id = ?' : 't.current = 1';
    return this.db.all<{ team_1_id: number, team_2_id: number, score_1: number, score_2: number, finished: number }>(
        `SELECT m.team_1_id, m.team_2_id, m.finished, g.score_1, g.score_2
         FROM match_110 m
                  JOIN game_110 g ON g.match_110_id = m.id
                  JOIN tournament t ON t.id = m.tournament_id
         WHERE ${tournamentFilter}
           AND m.id = (SELECT MAX(m2.id) FROM match_110 m2
                       WHERE m2.tournament_id = m.tournament_id
                         AND m2.team_1_id = m.team_1_id
                         AND m2.team_2_id = m.team_2_id)
           AND g.id = (SELECT MAX(g2.id) FROM game_110 g2 WHERE g2.match_110_id = m.id)`,
        tournamentId ? [tournamentId] : []
    );
  }

  /** id игроков команды в разряде строки typePos (0..9) табло:
   *  0/1/2 элемента — сеяние с фолбэком на сильнейших. */
  private groupPlayers(teamId: number, typePos: number): number[] {
    const group = BOARD_GROUPS[typePos % BOARD_GROUPS.length];
    return (((this.teamOrder.avatars(teamId) as Record<string, {id: number}[]>)[group]) ?? []).map(p => p.id);
  }

  /** state строки игры — ответ клиенту для маркеров табло. */
  private boardState(g: {
    score_1: number, score_2: number,
    even_1_user_id: number | null, even_2_user_id: number | null,
    serve_user_id: number | null, game_type_pos: number
  }): Board110State {
    return {
      score_1: g.score_1,
      score_2: g.score_2,
      even_1_user_id: g.even_1_user_id,
      even_2_user_id: g.even_2_user_id,
      serve_user_id: g.serve_user_id,
      game_type_pos: g.game_type_pos
    };
  }

  /** Ростеры обеих команд в текущем разряде строки игры. */
  private rosters(g: { game_type_pos: number }, teamId1: number, teamId2: number) {
    return {1: this.groupPlayers(teamId1, g.game_type_pos), 2: this.groupPlayers(teamId2, g.game_type_pos)};
  }

  increaseCurrentByTeamIds(teamId1: number, teamId2: number, teamNumber: string, tournamentId?: number): Board110State | null {
    const g = this.getCurrentByTeamIds(teamId1, teamId2, tournamentId) as unknown as Game110BoardRow | undefined;
    // матча нет или он уже завершён — инкремента нет
    if (!g) return null;
    const winner = (teamNumber === "1" ? 1 : 2) as 1 | 2;
    const roster = this.rosters(g, teamId1, teamId2);
    // чётность до очка: NULL или вне текущего ростера (смена разряда
    // без type-pos) — база (первый игрок группы)
    const even: Record<1 | 2, number | undefined> = {
      1: g.even_1_user_id !== null && roster[1].includes(g.even_1_user_id) ? g.even_1_user_id : roster[1][0],
      2: g.even_2_user_id !== null && roster[2].includes(g.even_2_user_id) ? g.even_2_user_id : roster[2][0]
    };
    const servingTeam = g.serve_user_id
        ? (roster[1].includes(g.serve_user_id) ? 1 : 2) as 1 | 2
        : null;
    this.db.run(
        `UPDATE game_110
         SET score_${winner} = score_${winner} + 1
         WHERE id = ? AND score_${winner} < 110`,
        [g!.id]
    );
    const updated = this.db.get<{ score_1: number, score_2: number, match_110_id: number }>(
        `SELECT score_1, score_2, match_110_id
         FROM game_110
         WHERE id = ?`,
        [g!.id]
    )!;
    // 110-е очко не прошло (счёт не изменился) — очка не было:
    // чётность и подачу не трогаем
    if (updated[`score_${winner}`] === g![`score_${winner}`]) {
      return this.boardState(this.getById(g!.id) as never);
    }
    const winnerScore = updated[`score_${winner}`];
    // граница партии — счёт победителя кратен 11: чётность/подачу не
    // пересчитываем, стык партий (следующий разряд, наследование
    // половин, подача победителя) оформляет type-pos
    if (winnerScore % 11 === 0) {
      if (winnerScore === 110) {
        // 110-е очко выигрывает матч: автозачёта за последнюю партию нет
        this.db.run(
            `UPDATE match_110
             SET finished = 1
             WHERE id = ?`,
            [updated.match_110_id]
        );
        return this.boardState(this.getById(g!.id) as never);
      }
      // автозачёт: проигравший партию получает минимум 5 очков за неё —
      // добор до 5×номер партии (11-5, 22-10, 33-15 …); набравший больше —
      // остаётся при своих
      const loser = winner === 1 ? 2 : 1;
      this.db.run(
          `UPDATE game_110
           SET score_${loser} = MAX(score_${loser}, ?)
           WHERE id = ?`,
          [5 * winnerScore / 11, g!.id]
      );
      return this.boardState(this.getById(g!.id) as never);
    }
    // подача после очка: подающая пара меняется кортами (выиграла очко
    // на своей подаче); подающий — игрок пары-победителя в корте,
    // соответствующем чётности её нового счёта. Пара, проигравшая
    // розыгрыш, корты не меняет. Подача не задана (первый розыгрыш до
    // тапа судьи) — считаем, что очко выиграно на приёме: без смены
    // кортов. Одиночный разряд: напарника нет — корты не меняются,
    // подающий всегда сам игрок
    if (servingTeam === winner && roster[winner].length === 2) {
      even[winner] = roster[winner].find(p => p !== even[winner]);
    }
    const serverUser = roster[winner].length === 2 && winnerScore % 2 !== 0
        ? roster[winner].find(p => p !== even[winner])!
        : even[winner] ?? null;
    this.db.run(
        `UPDATE game_110
         SET serve_user_id = ?, even_1_user_id = ?, even_2_user_id = ?
         WHERE id = ?`,
        [serverUser, even[1] ?? g.even_1_user_id, even[2] ?? g.even_2_user_id, g!.id]
    );
    return this.boardState(this.getById(g!.id) as never);
  }

  /** Подача на 0:0 — тап/двойной клик судьи по чётному игроку пары.
   *  Игра строки создаётся вместе с матчем — отсутствует (архивный
   *  матч) — отказа. */
  setCurrentServeByTeamIds(teamId1: number, teamId2: number, userId: number, tournamentId?: number): Board110State | null {
    const g = this.getCurrentByTeamIds(teamId1, teamId2, tournamentId) as unknown as Game110BoardRow | undefined;
    if (!g) return null;
    if (g.score_1 !== 0 || g.score_2 !== 0) return null;
    const roster = this.rosters(g, teamId1, teamId2);
    // подача выставляется только чётному игроку пары (база — первый)
    const even: Record<1 | 2, number | undefined> = {
      1: g.even_1_user_id !== null && roster[1].includes(g.even_1_user_id) ? g.even_1_user_id : roster[1][0],
      2: g.even_2_user_id !== null && roster[2].includes(g.even_2_user_id) ? g.even_2_user_id : roster[2][0]
    };
    if (userId !== even[1] && userId !== even[2]) return null;
    this.db.run(
        `UPDATE game_110 SET serve_user_id = ? WHERE id = ?`,
        [userId, g.id]
    );
    return this.boardState(this.getById(g.id) as never);
  }

  /** Минус очко (корректировка): только у идущего матча, счёт не ниже 0.
   *  Автозачёт и finished не трогаем — убавление не отменяет сыгранную
   *  партию, судья правит счёт вручную. */
  decreaseCurrentByTeamIds(teamId1: number, teamId2: number, teamNumber: string, tournamentId?: number) {
    const g = this.getCurrentByTeamIds(teamId1, teamId2, tournamentId);
    // матча нет или он уже завершён — декремента нет
    if (!g) return;
    const scorer = teamNumber === "1" ? "1" : "2";
    this.db.run(
        `UPDATE game_110
         SET score_${scorer} = score_${scorer} - 1
         WHERE id = ? AND score_${scorer} > 0`,
        [g!.id]
    );
  }

  create(match_110_id: number) {
    return this.db.run(
        `INSERT INTO game_110 (match_110_id, game_type_id, current)
         VALUES (?, 1, 1)`,
        [match_110_id]
    );
  }
}

export default Game110;