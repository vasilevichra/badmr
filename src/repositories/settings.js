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

  states() {
    return this.db.all(
        `WITH default_state (id) AS (SELECT coalesce(s.value, d.value)
                                     FROM defaults d
                                              LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id
                                              LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1
                                     WHERE d.name = 'state'
                                     LIMIT 1)
         SELECT s.*, CASE WHEN s.id = ds.id THEN 1 ELSE 0 END AS is_default
         FROM state s,
              default_state ds;`
    )
  }

  regions() {
    return this.db.all(
        `WITH default_region (id) AS (SELECT coalesce(s.value, d.value)
                                      FROM defaults d
                                               LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id
                                               LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1
                                      WHERE d.name = 'region'
                                      LIMIT 1)
         SELECT r.*, CASE WHEN r.id = dr.id THEN 1 ELSE 0 END AS is_default
         FROM region r,
              default_region dr;`
    )
  }

  cities() {
    return this.db.all(
        `WITH default_city (id) AS (SELECT coalesce(s.value, d.value)
                                    FROM defaults d
                                             LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id
                                             LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1
                                    WHERE d.name = 'city'
                                    LIMIT 1)
         SELECT c.*, CASE WHEN c.id = dc.id THEN 1 ELSE 0 END AS is_default
         FROM city c,
              default_city dc;`
    )
  }
}

module.exports = Settings;
