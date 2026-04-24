const Repository = require('./common');

class TeamOrder {
  constructor() {
    if (TeamOrder._instance) {
      return TeamOrder._instance;
    }
    TeamOrder._instance = this;

    this.db = new Repository().db;
  }

  positionNumberToName(position_number) {
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

  positionNumberToSex(position_number) {
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

  position(team_id, position_number) {
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

  select(team_id, position_number) {
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

  set(team_id, position_number, team_user_id) {
    const positionName = this.positionNumberToName(position_number);
    return this.db.run(
        `INSERT INTO team_order_110 (team_id, ${positionName}) VALUES (?, ?) ON CONFLICT(team_id) DO UPDATE SET ${positionName} = ? WHERE team_id = ?`,
        [team_id, team_user_id, team_user_id, team_id]
    );
  }
}

module.exports = TeamOrder;