import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";

class Settings {
  declare static _instance: Settings | undefined;
  db!: DB;

  constructor() {
    if (Settings._instance) {
      return Settings._instance;
    }
    Settings._instance = this;

    this.db = new Repository().db;
  }

  get(name: number | string) {
    return this.db.get<{ value: string }>(
        `SELECT distinct coalesce(s.value, d.value) AS value
         FROM defaults d
                  LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id AND s.tournament_id = (SELECT id FROM tournament WHERE current = 1)
                  LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1
         WHERE d.name = ?`,
        [name]
    );
  }

  getAll() {
    return this.db.all(
        `SELECT d.name AS name, coalesce(s.value, d.value) AS value, d.description AS description
         FROM defaults d
                  LEFT OUTER JOIN tournament_settings s ON s.defaults_id = d.id AND s.tournament_id = (SELECT id FROM tournament WHERE current = 1)
                  LEFT OUTER JOIN tournament t ON s.tournament_id = t.id AND t.current = 1`,
    );
  }

  getSettings() {
    const settings = this.db.all<{ name: string; value: unknown }>(
        `SELECT name, value
         FROM settings`
    );
    return settings.reduce((obj: Record<string, unknown>, s) => Object.assign(obj, {[s.name]: s.value}), {});
  }

  getDefaults() {
    const settings = this.db.all<{ name: string; value: unknown }>(
        `SELECT name, value
         FROM defaults`
    );
    return settings.reduce((obj: Record<string, unknown>, s) => Object.assign(obj, {[s.name]: s.value}), {});
  }

  set(name: string, value: string, tournament_id: number) {
    const id = tournament_id || this.db.get<{ id: number }>(`SELECT id FROM tournament WHERE current = 1`)?.id;
    return this.db.get(
        `INSERT INTO tournament_settings (defaults_id, tournament_id, value)
         VALUES ((SELECT id FROM defaults WHERE name = $name), $t_id, $value)
         ON CONFLICT DO UPDATE SET value = $value
         WHERE tournament_id = $t_id
           AND defaults_id = (SELECT id FROM defaults WHERE name = $name)`,
        {
          $name: name,
          $value: value,
          $t_id: id ?? null
        }
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
         SELECT r.*, t.name AS timezone, CASE WHEN r.id = dr.id THEN 1 ELSE 0 END AS is_default
         FROM region r
                  LEFT JOIN region_timezone rt ON rt.region_id = r.id
                  LEFT JOIN timezone t ON t.id = rt.timezone_id,
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

export default Settings;
