import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

interface GroupRow {
  group_id: number;
  team_id: number;
  user_lab_rating_1: number | null;
  user_lab_rating_2: number | null;
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
                ul.site_id                                         AS user_lab_site_id,
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

    // сеяние команд в группе по силе: рейтинг игрока — среднее его одиночного
    // и парного рейтингов лаб (что из них есть); сила команды — среднее по
    // её игрокам с рейтингом; команды без оценённых игроков — в конце группы.
    // Порядок групп не меняем (как в SQL: g.id DESC)
    const playerRating = (row: GroupRow) => {
      const ratings = [row.user_lab_rating_1, row.user_lab_rating_2].filter((v): v is number => v !== null);
      return ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null;
    };
    const teamStrength = (rows: GroupRow[]) => {
      const ratings = rows.map(playerRating).filter((v): v is number => v !== null);
      return ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : -1;
    };
    for (const groupId in groupedByGroup) {
      const teams = new Map<number, GroupRow[]>();
      for (const row of groupedByGroup[groupId] ?? []) {
        const rows = teams.get(row.team_id) ?? [];
        rows.push(row);
        teams.set(row.team_id, rows);
      }
      // игроки внутри команды — по убыванию рейтинга, без рейтинга — в конец
      teams.forEach(rows => rows.sort((a, b) => (playerRating(b) ?? -1) - (playerRating(a) ?? -1)));
      const sortedTeams = [...teams.entries()].sort((a, b) => teamStrength(b[1]) - teamStrength(a[1]));
      // ключи с префиксом: JS упорядочивает целочисленные ключи объекта
      // численно, что сломало бы порядок команд — вьюха идёт по Object.values
      const teamObject: Record<string, GroupRow[]> = {};
      for (const [teamId, rows] of sortedTeams) teamObject[`team_${teamId}`] = rows;
      groups.push({[groupId]: teamObject});
    }

    return groups;
  }
}

export default Group;