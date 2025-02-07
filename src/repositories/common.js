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
    // console.log(calculated_objects);
    //
    // const calculatedUserIds = calculated_objects ? calculated_objects.reduce((ids, users) => {
    //   ids.push(users.players1[0].id, users.players1[1].id, users.players2[0].id, users.players2[1].id);
    //   return ids;
    // }, []) : [];

    return this.db.all(
        `SELECT *
         FROM ready
         WHERE user_id NOT IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(calculated_objects)]
    );
  }
}

module.exports = Common;