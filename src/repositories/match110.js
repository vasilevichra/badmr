const Repository = require('./common');
const SettingsService = require('../services/settings'), settingsService = new SettingsService();
const Promise = require('bluebird');

class Match {
  constructor() {
    if (Match._instance) {
      return Match._instance;
    }
    Match._instance = this;

    this.db = new Repository().db;
  }

  create(team_1_id, team_2_id) {
    return this.db.run(
        `INSERT INTO match_110 (tournament_id,
                               team_1_id,
                               team_2_id,
                               court_id)
         VALUES ((SELECT id FROM tournament WHERE current = 1),
                 ?,
                 ?,
                 (SELECT c.id FROM court c JOIN tournament t on c.tournament_id = t.id WHERE c.available = 1 AND t.current = 1 ORDER BY c.id LIMIT 1))`,
        [team_1_id, team_2_id]
    );
  }
}

module.exports = Match;