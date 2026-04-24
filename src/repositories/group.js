const Repository = require('./common');

class Group {
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
    return this.db.all(
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
         ORDER BY g.id DESC`)
    .then(result => Object.groupBy(result, ({group_id}) => group_id))
    .then(groupedByGroup => {
      let groups = [];
      for (const groupId in groupedByGroup) {
        groups.push({[groupId]: Object.groupBy(groupedByGroup[groupId], ({team_id}) => team_id)});
      }
      return groups;
    });
  }
}

module.exports = Group;