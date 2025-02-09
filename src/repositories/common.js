const DB = require("../db");

class Common {
  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.db = new DB('./badmr.sqlite3');
  }

  ready(calculated_objects = []) {
    const uniqUsedUserIds = [...new Set(
        calculated_objects
        .flat(1)
        .map(obj =>
            obj.players1.map(p => p.user_id).concat(obj.players2.map(p => p.user_id))
        )
        .flat(1)
    )];

    return this.db.all(
        `SELECT *
         FROM ready
         WHERE user_id NOT IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(uniqUsedUserIds)]
    );
  }
}

module.exports = Common;