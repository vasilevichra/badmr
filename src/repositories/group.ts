import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

interface GroupRow {
  group_id: number;
  team_id: number;
}

class Group {
  declare static _instance: Group | undefined;
  db!: DB;

  constructor() {
    if (Group._instance) {
      return Group._instance;
    }
    Group._instance = this;

    this.db = new Repository().db;
  }

  select() {
    return this.db.all(
        `SELECT id, name AS text
         FROM "group"`);
  }

  getAll() {
    const result = this.db.all<GroupRow>(
        `SELECT t.group_id                                        AS group_id,
                g.name                                            AS group_name,
                c.name                                            AS team_city,
                t.id                                              AS team_id,
                t.name                                            AS team_name,
                tc.hex                                            AS team_color,
                u.id                                              AS user_id,
                u.lastname                                        AS user_lastname,
                u.firstname                                       AS user_firstname,
                u.patronymic                                      AS user_patronymic,
                u.sex                                             AS user_sex,
                coalesce(up.pic, ul.img)                          AS user_pic,
                (SELECT id FROM "group" WHERE id = tu.group_id)   AS user_group_id,
                (SELECT name FROM "group" WHERE id = tu.group_id) AS user_group_name,
                ul.rating_1                                       AS user_lab_rating_1,
                ul.rating_2                                       AS user_lab_rating_2
         FROM "group" g
                  JOIN team t on g.id = t.group_id
                  JOIN tournament tt on tt.id = t.tournament_id AND tt.current = 1
                  JOIN team_user tu on tu.team_id = t.id
                  JOIN team_color tc on t.team_color_id = tc.id
                  JOIN city c on t.city_id = c.id
                  JOIN user u on tu.user_id = u.id
                  LEFT JOIN user_pic up on u.id = up.user_id
                  LEFT JOIN user_lab ul on u.id = ul.user_id
         ORDER BY g.id DESC`);
    const groupedByGroup = Object.groupBy(result as GroupRow[], (row: GroupRow) => row.group_id);
    const groups: Record<string, Partial<Record<number, GroupRow[]>>>[] = [];
    for (const groupId in groupedByGroup) {
      const rows = groupedByGroup[groupId] ?? [];
      groups.push({[groupId]: Object.groupBy(rows, (row: GroupRow) => row.team_id) as Partial<Record<number, GroupRow[]>>});
    }
    return groups;
  }
}

export default Group;