const Repository = require('./common');

class Settings {
  constructor() {
    if (Settings._instance) {
      return Settings._instance;
    }
    Settings._instance = this;

    this.db = new Repository().db;
  }

  get(name, tournament_id = 0) {
    return this.db.get(
      `SELECT coalesce(s.value, d.value) AS value
       FROM defaults d
       LEFT OUTER JOIN tournament_settings s ON s.name = d.name AND s.tournament_id = ?
       WHERE d.name = ?`,
      [tournament_id, name]);
  }
}

module.exports = Settings;