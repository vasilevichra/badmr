import Repository from './common.ts';
import DB, { type RunResult } from "../db.ts";
import crypto from 'crypto';

interface BuddyRow {
  user_id: number;
  user_name: string;
  user_sex: number | null;
  user_pic: string | null;
  win_count: number;
  lose_count: number;
  win_rate: number;
}

interface WorstOpponentRow {
  user_id: number;
  user_name: string;
  user_sex: number | null;
  user_pic: string | null;
  lose_rate: number;
}

class User {
  declare static _instance: User | undefined;
  db!: DB;

  constructor() {
    if (User._instance) {
      return User._instance;
    }
    User._instance = this;

    this.db = new Repository().db;
  }

  getArchived(tournamentId?: number) {
    return this.db.all(
        `SELECT * FROM archived WHERE tournament_id = coalesce(?, (SELECT id FROM tournament WHERE current = 1))`,
        [tournamentId ?? null]
    );
  }

  getAll(tournamentId?: number) {
    return this.db.all(
        `SELECT * FROM players WHERE tournament_id = coalesce(?, (SELECT id FROM tournament WHERE current = 1))`,
        [tournamentId ?? null]
    );
  }

  select(city_id: number) {
    return this.db.all(`SELECT u.id, u.lastname || ' ' || u.firstname AS text
                        FROM user u
                                 LEFT JOIN team_user tu ON u.id = tu.user_id
                                 LEFT JOIN team t ON tu.team_id = t.id
                                 LEFT JOIN tournament tt ON t.tournament_id = tt.id AND tt.current = 1
                                 LEFT JOIN tournament_user ttu ON tt.id = ttu.tournament_id AND ttu.archived = 0
                        WHERE u.city_id = ?
                          AND tu.user_id IS NULL`,
        [city_id]
    );
  }

  getById(id: number) {
    return this.db.get<{ lastname: string; firstname: string; sex: number; pic: string | null }>(
        `SELECT u.id,
                u.lastname,
                u.firstname,
                u.patronymic,
                u.birthday,
                cast(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', u.birthday) AS INT) AS age,
                u.sex,
                coalesce(up.pic, ul.img)                                                  AS pic,
                u.city_id,
                ul.rating_1,
                ul.rating_2,
                ul.site_login,
                ul.site_id,
                ul.club
         FROM user u
                  LEFT OUTER JOIN user_pic up ON u.id = up.user_id
                  LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
         WHERE u.id = ?`,
        [id]
    );
  }

  findBy(lastname: string, firstname: string, patronymic: string, city_id?: number) {
    // сравнение без учёта замены ё/е: «Соловьёва» должна находиться
    // и по запросу «Соловьева», и наоборот; нормализуем обе стороны к «е»
    const yo = (expr: string) => `REPLACE(REPLACE(${expr}, 'Ё', 'Е'), 'ё', 'е')`;
    const norm = (s: string) => s.replaceAll('Ё', 'Е').replaceAll('ё', 'е');
    lastname = norm(lastname);
    firstname = norm(firstname);
    patronymic = norm(patronymic);

    // необязательный фильтр по городу пользователя (город проведения турнира)
    const cityFilter = city_id ? ' AND u.city_id = ?' : '';
    const cityParams = city_id ? [city_id] : [];

    if (patronymic) {
      return this.db.all(
          `SELECT u.id, u.lastname, u.firstname, u.patronymic, u.sex, coalesce(up.pic, ul.img) AS pic, c.name AS city
           FROM user u
                    JOIN city c on c.id = u.city_id
                    LEFT OUTER JOIN user_pic up ON u.id = up.user_id
                    LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
           WHERE ${yo('u.lastname')} = ?
             AND ${yo('u.firstname')} = ?
             AND ${yo('u.patronymic')} LIKE ?${cityFilter}`,
          [lastname, firstname, patronymic + '%', ...cityParams]
      );
    }

    if (firstname) {
      return this.db.all(
          `SELECT u.id, u.lastname, u.firstname, u.patronymic, u.sex, coalesce(up.pic, ul.img) AS pic, c.name AS city
           FROM user u
                    JOIN city c on c.id = u.city_id
                    LEFT OUTER JOIN user_pic up ON u.id = up.user_id
                    LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
           WHERE ${yo('u.lastname')} = ?
             AND ${yo('u.firstname')} LIKE ?${cityFilter}`,
          [lastname, firstname + '%', ...cityParams]
      );
    }

    return this.db.all(
        `SELECT u.id, u.lastname, u.firstname, u.patronymic, u.sex, coalesce(up.pic, ul.img) AS pic, c.name AS city
         FROM user u
                  JOIN city c on c.id = u.city_id
                  LEFT OUTER JOIN user_pic up ON u.id = up.user_id
                  LEFT OUTER JOIN user_lab ul ON u.id = ul.user_id
         WHERE ${yo('u.lastname')} LIKE ?${cityFilter}`,
        [lastname + '%', ...cityParams]
    );
  }

  enable(ids: number[]) {
    return this.db.run(
        `UPDATE tournament_user
         SET available = 1
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND user_id IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(ids)]
    );
  }

  disable(ids: number[]) {
    return this.db.run(
        `UPDATE tournament_user
         SET available = 0
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND user_id IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(ids)]
    );
  }

  /**
   * Считает по каждому напарнику пользователя статистику совместных матчей:
   * число побед и поражений пары, в которой они играли вместе (соперники
   * не учитываются). Для каждой пары пользователя (1–2 и 3–4) напарником
   * считается второй её участник.
   *
   * Матч считается выигранным парой, если количество проигранных игр
   * противоположной пары (`lost_2_by` для пары 1, `lost_1_by` для пары 2)
   * не меньше настройки `wins` из settings, иначе — проигранным.
   *
   * Каждый результат обогащается данными пользователя (имя, пол, аватар).
   * @param id Id пользователя.
   * @param kind Какие напарники вернуть: `win` — только с совместными
   *             победами, `lose` — только с совместными поражениями,
   *             `all` — все.
   * @param scope Ограничение области: `tournamentId` — матчи одного
   *              турнира («на этом турнире»), `typeId` — матчи турниров
   *              одного типа («за всё время на турнирах подобного типа»).
   *              Без scope учитываются все матчи.
   * @returns Напарники с числом совместных побед/поражений и винрейтом
   *          в процентах.
   */
  private getBuddies(id: number, kind: 'win' | 'lose' | 'all', scope?: { tournamentId?: number; typeId?: number }) {
    const having = kind === 'win' ? 'HAVING win_count > 0'
      : kind === 'lose' ? 'HAVING lose_count > 0' : '';
    const order = kind === 'win' ? 'win_count DESC, win_rate DESC'
      : kind === 'lose' ? 'lose_count DESC, win_rate ASC' : 'win_rate DESC, win_count DESC';
    const filter = scope?.tournamentId !== undefined
      ? 'AND m.tournament_id = $tid'
      : scope?.typeId !== undefined
        ? 'AND m.tournament_id IN (SELECT id FROM tournament WHERE tournament_type_id = $tid)'
        : '';
    return this.db.all<BuddyRow>(`
                SELECT p.user_id,
                       u.lastname || ' ' || u.firstname AS user_name,
                       u.sex AS user_sex,
                       coalesce((SELECT pic FROM user_pic WHERE user_id = p.user_id ORDER BY id DESC LIMIT 1),
                                (SELECT img FROM user_lab WHERE user_id = p.user_id)) AS user_pic,
                       sum(p.won) AS win_count,
                       count(*) - sum(p.won) AS lose_count,
                       round(sum(p.won) * 100.0 / count(*), 2) AS win_rate
                FROM (SELECT m.id AS match_id,
                             CASE WHEN m.user_1_id = $user_id THEN m.user_2_id ELSE m.user_1_id END AS user_id,
                             count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins') AS won
                      FROM match m
                               JOIN game g ON m.id = g.match_id
                      WHERE $user_id IN (m.user_1_id, m.user_2_id)
                        ${filter}
                      GROUP BY m.id
                      HAVING count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                          OR count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      UNION ALL
                      SELECT m.id,
                             CASE WHEN m.user_3_id = $user_id THEN m.user_4_id ELSE m.user_3_id END,
                             count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      FROM match m
                               JOIN game g ON m.id = g.match_id
                      WHERE $user_id IN (m.user_3_id, m.user_4_id)
                        ${filter}
                      GROUP BY m.id
                      HAVING count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                          OR count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')) p
                         JOIN user u ON u.id = p.user_id
                GROUP BY p.user_id
                ${having}
                ORDER BY ${order}`,
        {
          $user_id: id,
          // $tid участвует в SQL только при заданном scope — неиспользуемый
          // именованный параметр node:sqlite отвергает
          ...(filter ? { $tid: scope?.tournamentId ?? scope?.typeId ?? null } : {}),
        }
    );
  }

  /**
   * Возвращает напарников пользователя, с которыми он выигрывал матчи,
   * отсортированных по убыванию числа совместных побед.
   * @param id Id пользователя.
   * @param scope Ограничение области — см. {@link getBuddies}.
   */
  getCoWinnersById(id: number, scope?: { tournamentId?: number; typeId?: number }) {
    return this.getBuddies(id, 'win', scope);
  }

  /**
   * Возвращает напарников пользователя, с которыми он проигрывал матчи,
   * отсортированных по убыванию числа совместных поражений.
   * @param id Id пользователя.
   * @param scope Ограничение области — см. {@link getBuddies}.
   */
  getCoLosersById(id: number, scope?: { tournamentId?: number; typeId?: number }) {
    return this.getBuddies(id, 'lose', scope);
  }

  /**
   * Возвращает всех напарников пользователя, включая тех, с кем не было
   * ни одной совместной победы, отсортированных по убыванию винрейта.
   * @param id Id пользователя.
   * @param scope Ограничение области — см. {@link getBuddies}.
   */
  getBuddiesById(id: number, scope?: { tournamentId?: number; typeId?: number }) {
    return this.getBuddies(id, 'all', scope);
  }

  /**
   * Возвращает соперников (участников противоположной пары), против которых
   * пользователь проигрывает чаще, чем выигрывает: доля поражений
   * в совместных доигранных матчах строго больше 50%. Учитываются только
   * доигранные матчи — те, в которых одна из пар выиграла `wins` игр.
   * Список отсортирован по убыванию доли поражений.
   * @param id Id пользователя.
   */
  getWorstOpponentsById(id: number) {
    return this.db.all<WorstOpponentRow>(`
                SELECT p.user_id,
                       u.lastname || ' ' || u.firstname AS user_name,
                       u.sex AS user_sex,
                       coalesce((SELECT pic FROM user_pic WHERE user_id = p.user_id ORDER BY id DESC LIMIT 1),
                                (SELECT img FROM user_lab WHERE user_id = p.user_id)) AS user_pic,
                       (count(*) - sum(p.won)) * 100.0 / count(*) AS lose_rate
                FROM (SELECT m.id AS match_id,
                             m.user_3_id AS user_id,
                             count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins') AS won
                      FROM match m
                               JOIN game g ON m.id = g.match_id
                      WHERE $user_id IN (m.user_1_id, m.user_2_id)
                      GROUP BY m.id
                      HAVING count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                          OR count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      UNION ALL
                      SELECT m.id, m.user_4_id, count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      FROM match m
                               JOIN game g ON m.id = g.match_id
                      WHERE $user_id IN (m.user_1_id, m.user_2_id)
                      GROUP BY m.id
                      HAVING count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                          OR count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      UNION ALL
                      SELECT m.id, m.user_1_id, count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      FROM match m
                               JOIN game g ON m.id = g.match_id
                      WHERE $user_id IN (m.user_3_id, m.user_4_id)
                      GROUP BY m.id
                      HAVING count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                          OR count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      UNION ALL
                      SELECT m.id, m.user_2_id, count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                      FROM match m
                               JOIN game g ON m.id = g.match_id
                      WHERE $user_id IN (m.user_3_id, m.user_4_id)
                      GROUP BY m.id
                      HAVING count(g.lost_1_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')
                          OR count(g.lost_2_by) > (SELECT value - 1 FROM settings WHERE name = 'wins')) p
                         JOIN user u ON u.id = p.user_id
                GROUP BY p.user_id
                HAVING lose_rate > 50
                ORDER BY lose_rate DESC,
                         (count(*) - sum(p.won)) DESC,
                         p.user_id`,
        {
          $user_id: id,
        }
    );
  }

  create(lastname: string, firstname: string, patronymic: string, rating: number, sex: number, city_id: number, birthday: string) {
    const user = this.db.get<{ id: number }>(
        `INSERT INTO user (lastname, firstname, patronymic, sex, city_id, birthday)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [lastname, firstname, patronymic, sex, city_id, birthday]
    );
    this.setRating(user!.id, Number(rating));
    return {id: user!.id};
  }

  registerAll() {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available)
         SELECT (SELECT t.id FROM tournament t WHERE t.current = 1), u.id, 1
         FROM user u
         WHERE true
         ON CONFLICT DO NOTHING`
    );
  }

  registerByIds(ids: number[]) {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         SELECT (SELECT t.id FROM tournament t WHERE t.current = 1), u.id, 1, 0
         FROM user u
         WHERE u.id IN (SELECT value FROM json_each(?))
         ON CONFLICT DO UPDATE SET available = 1,
                                   archived  = 0`,
        [JSON.stringify(ids)]
    );
  }

  deregisterAll() {
    return this.db.run(
        `DELETE
         FROM tournament_user
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)`
    );
  }

  deregisterByIds(ids: number[]) {
    return this.db.run(
        `DELETE
         FROM tournament_user
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
           AND user_id IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(ids)]
    );
  }

  isRegistered(id: number) {
    return this.db.get(
        `SELECT count(tu.id) == 1 AS registered FROM tournament_user tu
         JOIN tournament t on t.id = tu.tournament_id
         WHERE tu.user_id = ? AND t.current = 1`,
        [id]
    );
  }

  actualize() {
    this.archiveAll();
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         SELECT (SELECT id FROM tournament WHERE current = 1), user_id, 1, 0
         FROM delta_month
         WHERE true
         ON CONFLICT DO UPDATE SET available = 1,
                                   archived  = 0`
    );
  }

  archive(id: number) {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         VALUES ((SELECT id FROM tournament WHERE current = 1), ?, 0, 1)
         ON CONFLICT DO UPDATE SET archived  = 1,
                                   available = 0`,
        [id]
    );
  }

  archiveAll() {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         SELECT (SELECT id FROM tournament WHERE current = 1), id, 0, 1
         FROM players
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
         ON CONFLICT DO UPDATE SET available = 0,
                                   archived  = 1`
    );
  }

  unarchive(id: number) {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         VALUES ((SELECT id FROM tournament WHERE current = 1), ?, 1, 0)
         ON CONFLICT DO UPDATE SET available = 1,
                                   archived  = 0`,
        [id]
    );
  }

  unarchiveAll() {
    return this.db.run(
        `INSERT INTO tournament_user (tournament_id, user_id, available, archived)
         SELECT (SELECT id FROM tournament WHERE current = 1), id, 0, 1
         FROM players
         WHERE tournament_id = (SELECT id FROM tournament WHERE current = 1)
         ON CONFLICT DO UPDATE SET available = 1,
                                   archived  = 0`
    );
  }

  setPassword(id: number, password: string) {
    const salt = crypto.randomBytes(16);
    const hashed_password = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');
    return this.db.run(
        `UPDATE user
         SET hashed_password = ?,
             salt            = ?
         WHERE id = ?`,
        [hashed_password, salt, id]
    );
  }

  getRating(id: number) {
    return this.db.get(
        `SELECT round((coalesce(r.previous, 0) + coalesce(r.delta, 0)), 1) AS rating
         FROM (SELECT MAX(id) AS id, user_id, previous, delta FROM rating GROUP BY user_id) r
         WHERE user_id = ?`,
        [id]
    );
  }

  /** Состояние калибровки из последней строки рейтинга:
   *  stale — серия началась с неактуального рейтинга, series — номер матча в серии;
   *  is_seed — последняя строка является сидом (ручная установка без матча);
   *  outdated — рейтинг неактуален: сид или дата последнего матча
   *  старше calibration_fresh_days. Свежая строка с stale=0 — актуальный рейтинг. */
  getCalibration(id: number) {
    return this.db.get(
        `SELECT r.stale,
                r.series,
                r.match_id IS NULL AS is_seed,
                CASE WHEN r.match_id IS NULL THEN 1
                     WHEN julianday('now') - julianday(m.created_at) >
                          (SELECT CAST(value AS REAL)
                           FROM settings
                           WHERE name = 'calibration_fresh_days')
                     THEN 1 ELSE 0 END AS outdated
         FROM rating r
                  LEFT JOIN match m ON m.id = r.match_id
         WHERE r.user_id = ?
         ORDER BY r.id DESC
         LIMIT 1`,
        [id]
    );
  }

  setRating(id: number, rating: number) {
    return this.db.run(
        `INSERT INTO rating (user_id, previous)
         VALUES (?, ?)`,
        [id, rating]
    );
  }

  /** Привязки пользователей приложения к id профиля на badminton4u.ru. */
  getLabSites() {
    return this.db.all('SELECT user_id, site_id FROM user_lab WHERE site_id IS NOT NULL');
  }

  setLabInfo(user_id: number, site_id: number, site_login: string, site_name: string, rating_1: string, rating_2: string, img: string, city: string, club: string, year: string) {    return this.db.run(
        `INSERT INTO user_lab (user_id, site_id, site_login, site_name, rating_1, rating_2, img, city, club, year)
         VALUES ($user_id, $site_id, $site_login, $site_name, $rating_1, $rating_2, $img, $city, $club, $year)
         ON CONFLICT DO UPDATE SET site_id    = $site_id,
                                   site_login = $site_login,
                                   site_name  = $site_name,
                                   rating_1   = $rating_1,
                                   rating_2   = $rating_2,
                                   img        = $img,
                                   city       = $city,
                                   club       = $club,
                                   year       = $year
         WHERE user_id = $user_id`,
        {
          $user_id: user_id,
          $site_id: site_id,
          $site_login: site_login,
          $site_name: site_name,
          $rating_1: rating_1,
          $rating_2: rating_2,
          $img: img,
          $city: city,
          $club: club,
          $year: year
        }
    );
  }

  getDaysUntilBirthday(id: number) {
    return this.db.get(
        `SELECT CAST(CASE
                         WHEN strftime('%m-%d', birthday) >= strftime('%m-%d', 'now')
                             THEN julianday(strftime('%Y', 'now') || '-' || strftime('%m-%d', birthday)) - julianday('now')
                         ELSE julianday((strftime('%Y', 'now') + 1) || '-' || strftime('%m-%d', birthday)) - julianday('now') END AS int) AS days
         FROM user
         WHERE id = ?
         ORDER BY days`,
        [id]
    );
  }

  /**
   * Число матчей пользователя; с tournamentId — только в этом турнире,
   * без — за всё время.
   */
  getMatchesCount(id: number, tournamentId?: number) {
    return this.db.get(
        `SELECT count() AS count
         FROM user u
                  JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
         WHERE u.id = ?
           AND m.tournament_id = coalesce(?, m.tournament_id)`,
        [id, tournamentId ?? null]
    );
  }

  /**
   * Число игр пользователя; с tournamentId — только в этом турнире,
   * без — за всё время.
   */
  getGamesCount(id: number, tournamentId?: number) {
    return this.db.get(
        `SELECT count() AS count
         FROM user u
                  JOIN match m ON u.id IN (m.user_1_id, m.user_2_id, m.user_3_id, m.user_4_id)
                  JOIN game g on m.id = g.match_id
         WHERE u.id = ?
           AND m.tournament_id = coalesce(?, m.tournament_id)`,
        [id, tournamentId ?? null]
    );
  }
}

export default User;
