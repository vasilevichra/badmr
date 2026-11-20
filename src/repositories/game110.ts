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
  party_score_1: number;
  party_score_2: number;
}

/** Строка игры 110 (SELECT *) с колонками чётности/подачи (live-табло). */
export type Game110BoardRow = {
  id: number;
  match_110_id: number;
  game_type_id: number;
  current: number;
  score_1: number;
  score_2: number;
  even_1_user_id: number | null;
  even_2_user_id: number | null;
  serve_user_id: number | null;
  game_type_pos: number;
  party_score_1: number;
  party_score_2: number;
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

  getById(id: number): Game110BoardRow | undefined {
    return this.db.get<Game110BoardRow>(
        `SELECT *
         FROM game_110
         WHERE id = ?`,
        [id]
    );
  }

  /** Идущая игра матча пары. Без tournamentId — текущий турнир (мутации
   *  счёта всегда идут по нему); с id — указанный турнир (чтение со
   *  страниц архивных турниров). */
  getCurrentByTeamIds(teamId1: number, teamId2: number, tournamentId?: number): Game110BoardRow | undefined {
    const tournamentFilter = tournamentId ? 't.id = ?' : 't.current = 1';
    return this.db.get<Game110BoardRow>(
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
    return this.db.all<{ game_id: number, team_1_id: number, team_2_id: number, score_1: number, score_2: number, finished: number }>(
        `SELECT g.id AS game_id, m.team_1_id, m.team_2_id, m.finished, g.score_1, g.score_2
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
    serve_user_id: number | null, game_type_pos: number,
    party_score_1: number, party_score_2: number
  }): Board110State {
    return {
      score_1: g.score_1,
      score_2: g.score_2,
      even_1_user_id: g.even_1_user_id,
      even_2_user_id: g.even_2_user_id,
      serve_user_id: g.serve_user_id,
      game_type_pos: g.game_type_pos,
      party_score_1: g.party_score_1,
      party_score_2: g.party_score_2
    };
  }

  /** Ростеры обеих команд в текущем разряде строки игры. */
  private rosters(g: { game_type_pos: number }, teamId1: number, teamId2: number) {
    return {1: this.groupPlayers(teamId1, g.game_type_pos), 2: this.groupPlayers(teamId2, g.game_type_pos)};
  }

  increaseCurrentByTeamIds(teamId1: number, teamId2: number, teamNumber: string, tournamentId?: number): Board110State | null {
    const g = this.getCurrentByTeamIds(teamId1, teamId2, tournamentId);
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
         SET score_${winner} = score_${winner} + 1,
             -- партийный счёт — для гейта свапа чётности; кламп до 11 —
             -- партия не длиннее 11 очков, страховая защита инварианта
             party_score_${winner} = MIN(party_score_${winner} + 1, 11)
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
      return this.boardState(this.getById(g!.id)!);
    }
    const winnerScore = updated[`score_${winner}`];
    const loserScore = updated[`score_${winner === 1 ? 2 : 1}`];
    // граница партии — счёт победителя кратен 11 И он лидер: чётность/
    // подачу не пересчитываем, стык партий (следующий разряд,
    // наследование половин, подача победителя) оформляет type-pos.
    // Догоняющая, добравшаяся до пройденного кратного 11 (напр. 15:11),
    // партию не закрывает — очко пересчитывается как обычное
    if (winnerScore % 11 === 0 && winnerScore > loserScore) {
      if (winnerScore === 110) {
        // 110-е очко выигрывает матч: автозачёта за последнюю партию нет
        this.db.run(
            `UPDATE match_110
             SET finished = 1
             WHERE id = ?`,
            [updated.match_110_id]
        );
        return this.boardState(this.getById(g!.id)!);
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
      return this.boardState(this.getById(g!.id)!);
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
    // пустой ростер победителя (состав изменился между розыгрышами):
    // пересчитывать некому — чётность и подачу не трогаем
    if (roster[winner].length === 0) {
      return this.boardState(this.getById(g!.id)!);
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
    return this.boardState(this.getById(g!.id)!);
  }

  /** Подача на 0:0 — тап/двойной клик судьи по чётному игроку пары.
   *  Игра строки создаётся вместе с матчем — отсутствует (архивный
   *  матч) — отказа. */
  setCurrentServeByTeamIds(teamId1: number, teamId2: number, userId: number, tournamentId?: number): Board110State | null {
    const g = this.getCurrentByTeamIds(teamId1, teamId2, tournamentId);
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
    return this.boardState(this.getById(g.id)!);
  }

  /** Минус очко (корректировка): только у идущего матча, счёт не ниже 0.
   *  Автозачёт и finished не трогаем — убавление не отменяет сыгранную
   *  партию, судья правит счёт вручную. Чётность и подача откатываются
   *  по эвристике НЛ «очко выиграно подачей»; очко, закрывавшее партию
   *  (счёт лидера был кратен 11), откатывается вместе с разрядом —
   *  строка возвращается к предыдущему разряду. */
  decreaseCurrentByTeamIds(teamId1: number, teamId2: number, teamNumber: string, tournamentId?: number): Board110State | null {
    const g = this.getCurrentByTeamIds(teamId1, teamId2, tournamentId);
    // матча нет или он уже завершён — декремента нет
    if (!g) return null;
    const scorer = (teamNumber === "1" ? 1 : 2) as 1 | 2;
    const roster = this.rosters(g, teamId1, teamId2);
    const servingTeam = g.serve_user_id
        ? (roster[1].includes(g.serve_user_id) ? 1 : 2) as 1 | 2
        : null;
    const scorerScoreBefore = scorer === 1 ? g.score_1 : g.score_2;
    this.db.run(
        `UPDATE game_110
         SET score_${scorer} = score_${scorer} - 1,
             -- партийный счёт убывает вместе с матчевым; кламп от нуля —
             -- судейская коррекция ниже нуля партийный счёт не уводит
             party_score_${scorer} = MAX(party_score_${scorer} - 1, 0)
         WHERE id = ? AND score_${scorer} > 0`,
        [g.id]
    );
    const updated = this.getById(g.id)!;
    // уменьшать было нечего (счёт уже 0): очка не было — подачу и
    // чётность не откатываем, иначе повторный свайп вниз на 0:0 свапнет пару
    if (updated[`score_${scorer}`] === scorerScoreBefore) {
      return this.boardState(updated);
    }
    // уменьшаемый счёт стоял на границе партии (кратен 11 у лидера):
    // убавляемое очко закрывало партию — разряд строки откатывается к
    // предыдущему, чётность наследует половины (позиция even-игрока в
    // старой группе → та же позиция в группе предыдущего разряда),
    // подача — у убавившей стороны по чётности нового счёта (очко
    // отыграно её подачей, партия с этим счётом открывается заново).
    // Догоняющая от кратного 11 (15:11 → 15:10) — откатывается как
    // обычное очко
    if (scorerScoreBefore % 11 === 0 && scorerScoreBefore > (scorer === 1 ? g.score_2 : g.score_1)) {
      const prevPos = Math.max(0, g.game_type_pos - 1);
      const prevRoster = {
        1: this.groupPlayers(teamId1, prevPos),
        2: this.groupPlayers(teamId2, prevPos)
      };
      const oldRoster = this.rosters(g, teamId1, teamId2);
      const evenPrev = (team: 1 | 2): number | null => {
        const stored = team === 1 ? g.even_1_user_id : g.even_2_user_id;
        const idx = stored !== null ? oldRoster[team].indexOf(stored) : 0;
        const i = idx === -1 ? 0 : idx;
        return prevRoster[team][i] ?? prevRoster[team][0] ?? null;
      };
      const even1 = evenPrev(1);
      const even2 = evenPrev(2);
      const evenScorer = scorer === 1 ? even1 : even2;
      const newScore = updated[`score_${scorer}`];
      const serverUser = prevRoster[scorer].length === 0
          ? null
          : newScore % 2 === 0
              ? evenScorer
              : prevRoster[scorer].find(p => p !== evenScorer) ?? evenScorer;
      this.db.run(
          `UPDATE game_110
           SET game_type_pos = ?, serve_user_id = ?, even_1_user_id = ?, even_2_user_id = ?,
               -- убавляемое очко закрывало партию — она открывается заново,
               -- партийные счёты в ноль вместе с разрядом
               party_score_1 = 0, party_score_2 = 0
           WHERE id = ?`,
          [prevPos, serverUser, even1, even2, g.id]
      );
      return this.boardState(this.getById(g.id)!);
    }
    // эвристика НЛ: уменьшение счёта подающей пары = очко выиграно на
    // своей подаче (откат смены кортов + подающий по чётности нового
    // счёта); другой пары = на приёме (подача возвращается бывшей
    // подающей паре, корты не менялись). Одиночный разряд: напарника
    // нет — корты не откатываются
    const even: Record<1 | 2, number | undefined> = {
      1: g.even_1_user_id !== null && roster[1].includes(g.even_1_user_id) ? g.even_1_user_id : roster[1][0],
      2: g.even_2_user_id !== null && roster[2].includes(g.even_2_user_id) ? g.even_2_user_id : roster[2][0]
    };
    let serverUser: number | null = null;
    if (servingTeam !== null) {
      if (servingTeam === scorer && roster[scorer].length === 2) {
        even[scorer] = roster[scorer].find(p => p !== even[scorer]);
        const newScore = updated[`score_${scorer}`];
        serverUser = newScore % 2 === 0 ? even[scorer]! : roster[scorer].find(p => p !== even[scorer])!;
      } else {
        const stScore = updated[`score_${servingTeam}`];
        serverUser = stScore % 2 === 0
            ? even[servingTeam] ?? null
            : roster[servingTeam].length === 2
                ? roster[servingTeam].find(p => p !== even[servingTeam])!
                : even[servingTeam] ?? null;
      }
    }
    this.db.run(
        `UPDATE game_110
         SET serve_user_id = ?, even_1_user_id = ?, even_2_user_id = ?
         WHERE id = ?`,
        [serverUser, even[1] ?? g.even_1_user_id, even[2] ?? g.even_2_user_id, g.id]
    );
    return this.boardState(this.getById(g.id)!);
  }

  /** Граница партии: ненулевой счёт кратен 11 у лидера ровно с одной
   *  стороны, или 0:0 (0 кратен 11 арифметически — границей не является).
   *  Кратный 11 счёт догоняющей (напр. 15:11) — середина партии. */
  private static isPartyBoundary(score1: number, score2: number): boolean {
    const b1 = score1 > 0 && score1 % 11 === 0 && score1 > score2;
    const b2 = score2 > 0 && score2 % 11 === 0 && score2 > score1;
    return b1 !== b2 || (score1 === 0 && score2 === 0);
  }

  /** Ручной свап чётности кортов пары (судья свайпом по игроку) —
   *  только в начале партии, до первого набранного очка: расстановка
   *  по кортам фиксируется на партию, после очка двигать нельзя.
   *  Чётность — это только то, кто на каком корте;
   *  инвариант «подаёт по чётности счёта» сохраняется: если подаёт игрок
   *  свапаемой пары, подача переезжает на корт по чётности счёта, подача
   *  другой пары от свапа не зависит. */
  swapCurrentEvenByTeamIds(teamId1: number, teamId2: number, teamNumber: string, tournamentId?: number): Board110State | null {
    const g = this.getCurrentByTeamIds(teamId1, teamId2, tournamentId);
    if (!g) return null;
    // партия начата (есть очко) — смена чётности запрещена до следующей
    // партии (type-pos / откат границы decrease)
    if (g.party_score_1 !== 0 || g.party_score_2 !== 0) return null;
    const team = (teamNumber === "1" ? 1 : 2) as 1 | 2;
    const roster = this.rosters(g, teamId1, teamId2);
    const stored = team === 1 ? g.even_1_user_id : g.even_2_user_id;
    const even = stored !== null && roster[team].includes(stored) ? stored : roster[team][0];
    const other = roster[team].find(p => p !== even);
    // неполная пара (один игрок в разряде) — свапать некого
    if (other === undefined) return this.boardState(g);
    this.db.run(
        `UPDATE game_110 SET even_${team}_user_id = ? WHERE id = ?`,
        [other, g.id]
    );
    const serveTeam = g.serve_user_id
        ? (roster[1].includes(g.serve_user_id) ? 1 : 2) as 1 | 2
        : null;
    if (serveTeam === team) {
      const teamScore = team === 1 ? g.score_1 : g.score_2;
      const serverUser = teamScore % 2 === 0 ? other : even;
      this.db.run(
          `UPDATE game_110 SET serve_user_id = ? WHERE id = ?`,
          [serverUser, g.id]
      );
    }
    return this.boardState(this.getById(g.id)!);
  }

  /** Смена текущего разряда табло (клиент отправляет индекс строки из
   *  колбэка ответа increase — порядок гарантирован). Только на границе
   *  партии (как swap). Пересчитывает чётность по наследованию половин
   *  (позиция even-игрока в старой группе → та же позиция в новой) и
   *  подачу: подаёт победитель прошлой партии — сторона, чей счёт кратен
   *  11, игроком нового ростера на корте по чётности её счёта. При 0:0
   *  подача не трогается (не задана или выставлена судьёй). */
  setTypePosByTeamIds(teamId1: number, teamId2: number, typePos: number, tournamentId?: number): Board110State | null {
    const g = this.getCurrentByTeamIds(teamId1, teamId2, tournamentId);
    if (!g) return null;
    if (!Number.isInteger(typePos) || typePos < 0 || typePos >= BOARD_GROUPS.length * 2) return null;
    if (!Game110.isPartyBoundary(g.score_1, g.score_2)) return null;
    const oldRoster = this.rosters(g, teamId1, teamId2);
    const newRoster = {
      1: this.groupPlayers(teamId1, typePos),
      2: this.groupPlayers(teamId2, typePos)
    };
    // наследование половин: even-игрок новой группы — с той же позиции
    // группы (первый/второй), что и в прошлом разряде; вне старого
    // ростера — база (первый)
    const evenNew = (team: 1 | 2): number | null => {
      const stored = team === 1 ? g.even_1_user_id : g.even_2_user_id;
      const idx = stored !== null ? oldRoster[team].indexOf(stored) : 0;
      const i = idx === -1 ? 0 : idx;
      return newRoster[team][i] ?? newRoster[team][0] ?? null;
    };
    const even1 = evenNew(1);
    const even2 = evenNew(2);
    // подача: победитель прошлой партии — сторона, чей счёт кратен 11;
    // при 0:0 подачи ещё нет (или выставлена судьёй) — не трогаем
    let serve = g.serve_user_id;
    if (g.score_1 !== 0 || g.score_2 !== 0) {
      // граница гарантирована — лидер с кратным 11 счётом ровно один
      const winner = (g.score_1 > g.score_2 ? 1 : 2) as 1 | 2;
      const wEven = winner === 1 ? even1 : even2;
      const wScore = winner === 1 ? g.score_1 : g.score_2;
      serve = newRoster[winner].length === 2 && wScore % 2 !== 0
          ? newRoster[winner].find(p => p !== wEven) ?? wEven
          : wEven;
    }
    this.db.run(
        `UPDATE game_110
         SET game_type_pos = ?, even_1_user_id = ?, even_2_user_id = ?, serve_user_id = ?,
             -- type-pos оформляет старт партии — партийные счёты в ноль
             party_score_1 = 0, party_score_2 = 0
         WHERE id = ?`,
        [typePos, even1, even2, serve, g.id]
    );
    return this.boardState(this.getById(g.id)!);
  }

  /** Счёт последней игры матча 110 (победитель сетки — по очкам матча). */
  scoresByMatchId(match_110_id: number): { score_1: number; score_2: number } | undefined {
    return this.db.get<{ score_1: number; score_2: number }>(
        `SELECT score_1, score_2 FROM game_110
         WHERE match_110_id = ? ORDER BY id DESC LIMIT 1`,
        [match_110_id]
    );
  }

  /** id текущей игры матча 110 — для кнопки возобновления на сетке. */
  currentGameId(match_110_id: number): number | undefined {
    return this.db.get<{ id: number }>(
        `SELECT id FROM game_110
         WHERE match_110_id = ? AND current = 1
         ORDER BY id DESC LIMIT 1`,
        [match_110_id]
    )?.id;
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