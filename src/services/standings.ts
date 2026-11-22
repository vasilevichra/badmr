import Match110Repository from '../repositories/match110.ts';

export interface StandingRow {
  team_id: number;
  group_id: number;
  name: string;
  city: string;
  games: number;
  wins: number;
  losses: number;
  points: number;
  diff: number;
}

const match110Repository = new Match110Repository();

class Standings {
  /** Сводная таблица 110 по завершённым матчам: points = wins,
   *  diff = сумма (свои очки − чужие). Сортировка: очки ↓ → личная
   *  встреча (ровно две команды с равными очками, игравшие между
   *  собой) → diff ↓ → сеяние ↑ (сила команды). Матчи, где хотя бы
   *  одна команда из другой группы, не учитываются. basket — матч
   *  учитывается, только если обе команды лежат в этой корзине котла. */
  standings(tournamentId?: number, groupId?: number, basket?: number): StandingRow[] {
    const rows = match110Repository.standingsRows(tournamentId)
        .filter(r => r.finished === 1)
        .filter(r => groupId === undefined || (r.group_1_id === groupId && r.group_2_id === groupId))
        .filter(r => basket === undefined || (r.basket_1 === basket && r.basket_2 === basket));
    // имена/город команды — для рендера таблицы клиентом без доп. запросов
    const names = new Map<number, { name: string; city: string }>();
    for (const r of rows) {
      names.set(r.team_1_id, {name: r.name_1, city: r.city_1});
      names.set(r.team_2_id, {name: r.name_2, city: r.city_2});
    }

    const teams = new Map<number, { group_id: number; games: number; wins: number; losses: number; diff: number }>();
    const bump = (teamId: number, groupId: number, win: boolean, diff: number): void => {
      const entry = teams.get(teamId) ?? {group_id: groupId, games: 0, wins: 0, losses: 0, diff: 0};
      entry.games++;
      win ? entry.wins++ : entry.losses++;
      entry.diff += diff;
      teams.set(teamId, entry);
    };
    for (const r of rows) {
      bump(r.team_1_id, r.group_1_id, r.score_1 > r.score_2, r.score_1 - r.score_2);
      bump(r.team_2_id, r.group_2_id, r.score_2 > r.score_1, r.score_2 - r.score_1);
    }

    const strength = new Map(match110Repository.strengthOrder(tournamentId).map((t, i) => [t.team_id, i]));
    const result = [...teams.entries()].map(([team_id, s]) => ({
      team_id, group_id: s.group_id,
      name: names.get(team_id)?.name ?? '', city: names.get(team_id)?.city ?? '',
      games: s.games, wins: s.wins, losses: s.losses,
      points: s.wins, diff: s.diff
    }));

    result.sort((a, b) => b.points - a.points || b.diff - a.diff
        || (strength.get(a.team_id) ?? Infinity) - (strength.get(b.team_id) ?? Infinity));

    // личная встреча: ровно две команды с равными очками и сыгранный
    // матч между ними — победитель личной выше (перестановка соседей)
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i].points !== result[i + 1].points) continue;
      if (i + 2 < result.length && result[i + 2].points === result[i].points) continue;
      if (i > 0 && result[i - 1].points === result[i].points) continue;
      const h2h = this.headToHead(rows, result[i].team_id, result[i + 1].team_id);
      if (h2h < 0) [result[i], result[i + 1]] = [result[i + 1], result[i]];
    }
    return result;
  }

  /** +1 если a выше b по личным встречам, −1 если ниже, 0 — не играли
   *  или равное число побед. */
  private headToHead(rows: { team_1_id: number; team_2_id: number; score_1: number; score_2: number }[],
                     a: number, b: number): number {
    const winsA = rows.filter(r => (r.team_1_id === a && r.team_2_id === b && r.score_1 > r.score_2)
        || (r.team_1_id === b && r.team_2_id === a && r.score_2 > r.score_1)).length;
    const winsB = rows.filter(r => (r.team_1_id === b && r.team_2_id === a && r.score_1 > r.score_2)
        || (r.team_1_id === a && r.team_2_id === b && r.score_2 > r.score_1)).length;
    return Math.sign(winsA - winsB);
  }
}

export default Standings;
