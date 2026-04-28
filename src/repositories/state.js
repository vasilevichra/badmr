const Repository = require('./common');

class State {
  constructor() {
    if (State._instance) {
      return State._instance;
    }
    State._instance = this;

    this.db = new Repository().db;
  }

  getByUserId(user_id) {
    return this.db.get(
        `SELECT s.id, s.name
         FROM state s
                  JOIN region r on s.id = r.state_id
                  JOIN city c on r.id = c.region_id
                  JOIN user u ON c.id = u.city_id
         WHERE u.id = ?`,
        [user_id]
    );
  }
}

module.exports = State;