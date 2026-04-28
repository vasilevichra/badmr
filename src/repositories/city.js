const Repository = require('./common');

class City {
  constructor() {
    if (City._instance) {
      return City._instance;
    }
    City._instance = this;

    this.db = new Repository().db;
  }

  select() {
    return this.db.all(
        `SELECT id, name AS text
         FROM city`);
  }

  getByTeamId(team_id) {
    return this.db.get(
        `SELECT c.id, c.name
         FROM city c
                  JOIN team t ON c.id = t.city_id
         WHERE t.id = ?`,
        [team_id]
    );
  }

  getByUserId(user_id) {
    return this.db.get(
        `SELECT c.id, c.name
         FROM city c
                  JOIN user u ON c.id = u.city_id
         WHERE u.id = ?`,
        [user_id]
    );
  }

}

module.exports = City;