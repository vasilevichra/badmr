const Repository = require('./common');

class Rating {
  constructor() {
    if (Rating._instance) {
      return Rating._instance;
    }
    Rating._instance = this;

    this.db = new Repository().db;
  }

  getByUserId(user_id) {
    return this.db.all(
        `SELECT g.created_at AS x, (r.previous + r.delta) AS y
         FROM rating r
                  JOIN user u ON r.user_id = u.id
                  JOIN match m ON r.match_id = m.id
                  JOIN (SELECT match_id, created_at, max(id) AS mid FROM game GROUP BY match_id) g ON m.id = g.match_id
         WHERE u.id = ?`,
        [user_id]
    );
  }

}

module.exports = Rating;