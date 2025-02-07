const Repository = require('./common');

class Settings {
  constructor() {
    if (Settings._instance) {
      return Settings._instance;
    }
    Settings._instance = this;

    this.db = new Repository().db;
  }

  get(name) {
    return this.db.get(
        `SELECT coalesce(s.value, d.value) AS value
         FROM defaults d
                  LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id
                  LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1
         WHERE d.name = ?`,
        [name]
    );
  }

  getAll() {
    return this.db.all(
        `SELECT d.name AS name, coalesce(s.value, d.value) AS value, d.description AS description
         FROM defaults d
                  LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id
                  LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1`,
    );
  }
}

module.exports = Settings;