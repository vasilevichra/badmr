import GroupRepository from '../repositories/group.ts';
import Repository from '../repositories/common.ts';

export interface HistTeam {
  name: string;
  city: string;
}

export interface HistMatch {
  id: number;
  team_1_id: number;
  team_2_id: number;
  team_1: HistTeam;
  team_2: HistTeam;
  score_1: number;
  score_2: number;
  finished: 0 | 1;
  // по счёту последней игры (110 очков — победа); незавершённый или ничья — null
  winner_id: number | null;
}

export interface HistPocket {
  name: string;
  // котёл привязан к группе: сетка котла рендерится под составами её команд
  group_id: number;
  // rounds[r-1] — матчи круга r в порядке создания; круг матча = max кругов
  // предыдущих матчей его команд + 1 («две жизни» ложатся в колонки сами)
  rounds: HistMatch[][];
}

interface HistRow {
  id: number;
  team_1_id: number;
  team_2_id: number;
  score_1: number;
  score_2: number;
  finished: 0 | 1;
  group_1_id: number;
  name_1: string;
  city_1: string;
  name_2: string;
  city_2: string;
}

class BracketHistory {
  declare static _instance: BracketHistory | undefined;
  group!: GroupRepository;
  db!: Repository['db'];

  constructor() {
    if (BracketHistory._instance) {
      return BracketHistory._instance;
    }
    BracketHistory._instance = this;

    this.group = new GroupRepository();
    this.db = new Repository().db;
  }

  /** Реконструкция сыгранной сетки архивного турнира 110 без слотов:
   *  матчи группируются по котлам (group_id команд), круг назначается
   *  жадно — максимум из кругов прошлых матчей участников + 1. Только
   *  чтение, ничего не пишет в БД. */
  historical110(tournamentId: number): { pockets: HistPocket[] } {
    const pockets = this.group.pockets(tournamentId);
    const rows = this.db.all<HistRow>(
        `SELECT m.id,
                m.team_1_id,
                m.team_2_id,
                g.score_1,
                g.score_2,
                m.finished,
                t1.group_id AS group_1_id,
                t1.name AS name_1,
                c1.name AS city_1,
                t2.name AS name_2,
                c2.name AS city_2
         FROM match_110 m
                  JOIN game_110 g ON g.match_110_id = m.id
                  JOIN team t1 ON t1.id = m.team_1_id
                  JOIN team t2 ON t2.id = m.team_2_id
                  JOIN city c1 ON c1.id = t1.city_id
                  JOIN city c2 ON c2.id = t2.city_id
         WHERE m.tournament_id = ?
           AND m.stage IS NULL
           AND g.id = (SELECT MAX(g2.id) FROM game_110 g2 WHERE g2.match_110_id = m.id)
         ORDER BY m.id`,
        [tournamentId]
    );
    // круг команды: номер круга её последнего сыгранного (в порядке id) матча
    const lastRound = new Map<number, number>();
    const matches = rows.map(row => {
      const round = Math.max(lastRound.get(row.team_1_id) ?? 0, lastRound.get(row.team_2_id) ?? 0) + 1;
      lastRound.set(row.team_1_id, round);
      lastRound.set(row.team_2_id, round);
      const winner = row.finished === 0 ? null
          : row.score_1 > row.score_2 ? row.team_1_id
          : row.score_2 > row.score_1 ? row.team_2_id
          : null;
      const match: HistMatch = {
        id: row.id,
        team_1_id: row.team_1_id,
        team_2_id: row.team_2_id,
        team_1: {name: row.name_1, city: row.city_1},
        team_2: {name: row.name_2, city: row.city_2},
        score_1: row.score_1,
        score_2: row.score_2,
        finished: row.finished,
        winner_id: winner,
      };
      return {row, round, match};
    });
    // котлы в алфавитном порядке имён (C раньше D), матчи — по кругам
    const byGroup = new Map<number, HistMatch[][]>();
    for (const {row, round, match} of matches) {
      const rounds = byGroup.get(row.group_1_id) ?? [];
      (rounds[round - 1] ??= []).push(match);
      byGroup.set(row.group_1_id, rounds);
    }
    return {
      pockets: pockets
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(p => ({name: p.name, group_id: p.group_id, rounds: byGroup.get(p.group_id) ?? []})),
    };
  }
}

export default BracketHistory;
