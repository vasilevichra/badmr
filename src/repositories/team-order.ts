import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class TeamOrder {
  declare static _instance: TeamOrder | undefined;
  db!: DB;

  constructor() {
    if (TeamOrder._instance) {
      return TeamOrder._instance;
    }
    TeamOrder._instance = this;

    this.db = new Repository().db;
  }

  positionNumberToName(position_number: number) {
    switch (position_number) {
      case 1:
        return 'ms1';
      case 2:
        return 'ws1';
      case 3:
        return 'md11';
      case 4:
        return 'md12';
      case 5:
        return 'wd11';
      case 6:
        return 'wd12';
      case 7:
        return 'xd11';
      case 8:
        return 'xd12';
      case 9:
        return 'ms2';
      case 10:
        return 'ws2';
      case 11:
        return 'md21';
      case 12:
        return 'md22';
      case 13:
        return 'wd21';
      case 14:
        return 'wd22';
      case 15:
        return 'xd21';
      case 16:
        return 'xd22';
      default:
        throw new Error(`Bad position number [1-16]: ${position_number}`);
    }
  }

  positionNumberToSex(position_number: number) {
    switch (position_number) {
      case 1:
      case 3:
      case 4:
      case 7:
      case 9:
      case 11:
      case 12:
      case 15:
        return 1;
      case 2:
      case 5:
      case 6:
      case 8:
      case 10:
      case 13:
      case 14:
      case 16:
        return 0;
      default:
        throw new Error(`Bad position number [1-16]: ${position_number}`);
    }
  }

  position(team_id: number, position_number: number) {
    const positionName = this.positionNumberToName(position_number);
    return this.db.get(
        `SELECT tu.id, u.lastname || ' ' || u.firstname AS name, u.sex, coalesce(up.pic, ul.img)
         FROM team_user tu
                  JOIN user u ON u.id = tu.user_id
                  LEFT JOIN user_pic up ON u.id = up.user_id
                  LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
         WHERE tu.team_id = ?
           AND tu.id = (SELECT o.${positionName} FROM team_order_110 o WHERE o.team_id = tu.team_id)`,
        [team_id]
    );
  }

  select(team_id: number, position_number: number) {
    const sex = this.positionNumberToSex(position_number);
    return this.db.all(
        `SELECT DISTINCT tu.id, u.lastname || ' ' || u.firstname AS name, u.sex, coalesce(up.pic, ul.img)
         FROM team_user tu
         JOIN user u ON u.id = tu.user_id
         LEFT JOIN team_order_110 o ON tu.id IN (o.ms1, o.ws1, o.md11, o.md12, o.wd11, o.wd12, o.xd11, o.xd12, o.ms2, o.ws2, o.md21, o.md22, o.wd21, o.wd22, o.xd21, o.xd22)
         LEFT JOIN user_pic up ON u.id = up.user_id
         LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
         WHERE tu.team_id = ? AND u.sex = ?`,
        [team_id, sex]
    );
  }

  /** Весь состав команды для авторасстановки: пол и сила — средний рейтинг
   *  лаба (rating_1/rating_2, что есть; без рейтингов — 0, самый слабый). */
  roster(team_id: number) {
    return this.db.all<{id: number, name: string, sex: number, rating: number}>(
        `SELECT tu.id,
                u.lastname || ' ' || u.firstname          AS name,
                u.sex,
                (COALESCE(ul.rating_1, ul.rating_2, 0) +
                 COALESCE(ul.rating_2, ul.rating_1, 0)) / 2.0 AS rating
         FROM team_user tu
                  JOIN user u ON u.id = tu.user_id
                  LEFT OUTER JOIN user_lab ul ON ul.user_id = u.id
         WHERE tu.team_id = ?`,
        [team_id]
    );
  }

  set(team_id: number, position_number: number, team_user_id: number) {
    const positionName = this.positionNumberToName(position_number);
    return this.db.run(
        `INSERT INTO team_order_110 (team_id, ${positionName}) VALUES (?, ?) ON CONFLICT(team_id) DO UPDATE SET ${positionName} = ? WHERE team_id = ?`,
        [team_id, team_user_id, team_user_id, team_id]
    );
  }

  /** Игроки команды по разрядам первой половины табло (для аватаров):
   *  МО — сеяние ms1, ЖО — ws1, МП — md11/md12, ЖП — wd11/wd12,
   *  СП — xd11/xd12 (пол позиции — positionNumberToSex). Пустая позиция
   *  сеяния — фолбэк: сильнейший подходящего пола из состава (для пары
   *  второй — без уже взятого в разряд: CHECK md11 != md12 и т.п.). */
  avatars(team_id: number) {
    const players = this.db.all<{id: number, name: string, sex: number, pic: string | null, rating: number}>(
        `SELECT tu.id,
                u.lastname || ' ' || u.firstname AS name,
                u.sex,
                coalesce(up.pic, ul.img)         AS pic,
                (COALESCE(ul.rating_1, ul.rating_2, 0) +
                 COALESCE(ul.rating_2, ul.rating_1, 0)) / 2.0 AS rating
         FROM team_user tu
                  JOIN user u ON u.id = tu.user_id
                  LEFT JOIN user_pic up ON u.id = up.user_id
                  LEFT OUTER JOIN user_lab ul ON ul.user_id = u.id
         WHERE tu.team_id = ?`,
        [team_id]
    );
    const order = this.db.get<Record<string, number | null>>(
        `SELECT ms1, ws1, md11, md12, wd11, wd12, xd11, xd12 FROM team_order_110 WHERE team_id = ?`,
        [team_id]
    ) ?? {};
    const byId = new Map(players.map(p => [p.id, p]));
    const strongest = (sex: number, exclude: number[] = []) => players
        .filter(p => p.sex === sex && !exclude.includes(p.id))
        .sort((a, b) => b.rating - a.rating)[0] ?? null;
    const pick = (position: string, sex: number, exclude: number[] = []) =>
        (order[position] ? byId.get(order[position]!) : null) ?? strongest(sex, exclude);
    const pair = (first: string, second: string, sex: number) => {
      const p1 = pick(first, sex);
      const p2 = pick(second, sex, p1 ? [p1.id] : []);
      return [p1, p2].filter(Boolean);
    };
    return {
      МО: [pick('ms1', 1)].filter(Boolean),
      ЖО: [pick('ws1', 0)].filter(Boolean),
      МП: pair('md11', 'md12', 1),
      ЖП: pair('wd11', 'wd12', 0),
      СП: [pick('xd11', 1), pick('xd12', 0)].filter(Boolean)
    };
  }
}

export default TeamOrder;