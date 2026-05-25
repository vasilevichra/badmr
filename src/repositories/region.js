const Repository = require('./common');

class Region {
  constructor() {
    if (Region._instance) {
      return Region._instance;
    }
    Region._instance = this;

    this.db = new Repository().db;
  }

  select(state_id) {
    return state_id ?
        this.db.all(
            `SELECT r.id, r.name AS text
             FROM region r
                      JOIN state s on s.id = r.state_id
             WHERE s.id = ?`,
            [state_id]
        ) :
        this.db.all(
            `SELECT id, name AS text
             FROM region`
        );
  }

  getById(id) {
    return this.db.get(
        `SELECT id, name
         FROM region
         WHERE id = ?`,
        [id]
    );
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