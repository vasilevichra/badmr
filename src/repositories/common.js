const DB = require("../db");

class Common {
  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.db = new DB('./badm.sqlite3');
  }

  ready(tournament_id) {
    return this.db.all(
      `SELECT *
       FROM ready
       WHERE tournament_id = ?`,
     [tournament_id]
    );
  }
}

module.exports = Common;