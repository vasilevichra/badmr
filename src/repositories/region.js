const Repository = require('./common');

class Region {
  constructor() {
    if (Region._instance) {
      return Region._instance;
    }
    Region._instance = this;

    this.db = new Repository().db;
  }

  getByUserId(user_id) {
    return this.db.get(
        `SELECT r.id, r.name
         FROM region r
                  JOIN city c on r.id = c.region_id
                  JOIN user u ON c.id = u.city_id
         WHERE u.id = ?`,
        [user_id]
    );
  }

}

module.exports = Region;