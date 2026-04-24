const Repository = require('./common');

class TeamUser {
  constructor() {
    if (TeamUser._instance) {
      return TeamUser._instance;
    }
    TeamUser._instance = this;
    this.db = new Repository().db;
  }

  create(team_id, user_id, group_id) {
    return this.db.run(
        `INSERT INTO team_user (team_id, user_id, group_id)
         VALUES (?, ?, ?)`,
        [team_id, user_id, group_id]
    );
  }

  setGroupId(team_id, user_id, group_id) {
    return this.db.run(
        `UPDATE team_user
         SET group_id = ?
         WHERE team_id = ?
           AND user_id = ?`,
        [group_id, team_id, user_id]
    );
  }
}

module.exports = TeamUser;