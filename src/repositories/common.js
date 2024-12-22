const DB = require("../db");

class Common {
  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.db = new DB('./badm.sqlite3');
  }

  ready() {
    return this.db.all(
        `SELECT *
         FROM ready`
    );
  }
}

module.exports = Common;