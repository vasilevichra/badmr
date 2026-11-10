import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Game110 {
  declare static _instance: Game110 | undefined;
  db!: DB;

  constructor() {
    if (Game110._instance) {
      return Game110._instance;
    }
    Game110._instance = this;

    this.db = new Repository().db;
  }

  getById(id: number) {
    return this.db.get(
        `SELECT *
         FROM game_110
         WHERE id = ?`,
        [id]
    );
  }

  getCurrentByTeamIds(teamId1: number, teamId2: number) {
    return this.db.get<{ id: number }>(
        `SELECT g.*
         FROM game_110 g
                  JOIN match_110 m on g.match_110_id = m.id
                  JOIN tournament t on t.id = m.tournament_id
         WHERE t.current = 1
           AND m.finished = 0
           AND m.team_1_id = ?
           AND m.team_2_id = ?
           AND g.current = 1`,
        [teamId1, teamId2]
    );
  }

  increaseCurrentByTeamIds(teamId1: number, teamId2: number, teamNumber: string) {
    const g = this.getCurrentByTeamIds(teamId1, teamId2);
    // матча нет или он уже завершён — инкремента нет
    if (!g) return;
    const winner = teamNumber === "1" ? "1" : "2";
    const loser = winner === "1" ? "2" : "1";
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
    const winnerScore = winner === "1" ? updated.score_1 : updated.score_2;
    // конец партии — счёт выигравшей её стороны кратен 11
    if (winnerScore % 11 !== 0) return;
    if (winnerScore === 110) {
      // 110-е очко выигрывает матч: автозачёта за последнюю партию нет
      this.db.run(
          `UPDATE match_110
           SET finished = 1
           WHERE id = ?`,
          [updated.match_110_id]
      );
      return;
    }
    // автозачёт: проигравший партию получает минимум 5 очков за неё —
    // добор до 5×номер партии (11-5, 22-10, 33-15 …); набравший больше —
    // остаётся при своих
    this.db.run(
        `UPDATE game_110
         SET score_${loser} = MAX(score_${loser}, ?)
         WHERE id = ?`,
        [5 * winnerScore / 11, g!.id]
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