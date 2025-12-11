const DB = require("../db");
const Specific = require("./specific");
const crypto = require("crypto");

class Common {
  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.db = new DB(process.env.NODE_ENV === 'test' ? './.data/test.db' : './.data/badmr.sqlite3');
    // create an initial users
    const salt = crypto.randomBytes(16);
    (Specific.users || []).forEach(u => {
      this.db.database().run('UPDATE user SET hashed_password = ?, salt = ? WHERE id = ?', [
        crypto.pbkdf2Sync(u.password, salt, 310000, 32, 'sha256'),
        salt,
        u.id
      ]);
    });
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
