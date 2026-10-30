import Repository from './common.ts';
import DB, { type RunResult, type SqliteParam } from "../db.ts";
import CourtRepository from './court.ts';
const courtRepository = new CourtRepository();
import SettingsRepository from './settings.ts';
import VkService from '../services/vk.ts';
import schedule from 'node-schedule';

class Tournament {
  declare static _instance: Tournament | undefined;
  db!: DB;
  id: number | undefined;
  settingsRepository!: SettingsRepository;
  vk!: VkService;

  constructor() {
    if (Tournament._instance) {
      return Tournament._instance;
    }
    Tournament._instance = this;

    this.db = new Repository().db;
    this.vk = new VkService();
    this.settingsRepository = new SettingsRepository();
  }

  create(user_id: number, club_id: number, gym_id: number, type_id: number, name: string, registration_date: string, start_date: string, end_date: string, capacity: number, courts: number, min_rating: string, max_rating: string, rules_url: string, is_current: number, unit_id?: number) {

    const createTournamentStatements: SqliteParam[][] = [[
      `INSERT INTO tournament (user_id,
                               user_club_id,
                               gym_id,
                               unit_id,
                               tournament_type_id,
                               tournament_status_id,
                               name,
                               current,
                               reg_ended_at,
                               started_at,
                               ended_at,
                               rules)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      user_id, club_id, gym_id, unit_id || 1, type_id, 1, name, is_current, registration_date, start_date, end_date, rules_url]];

    if (is_current === 1) {
      createTournamentStatements.unshift([`UPDATE tournament SET current = 0 WHERE true;`]);
    }
    try {
      const changes = this.db.transaction(createTournamentStatements);
      this.id = changes[changes.length - 1].id!;
      this.settingsRepository.set('r_min', min_rating, this.id);
      this.settingsRepository.set('r_max', max_rating, this.id);
      for (let i = 0; i < courts; i++) {
        courtRepository.create(this.id);
      }
      return this.id;
    } catch {
      this.db.run(
          `DELETE
           FROM court
           WHERE tournament_id = ?`,
          [this.id ?? null]
      );
      return undefined;
    }
  }

  getCurrent(): { tournament_type_id: number } | undefined {
    return this.db.get(
        `SELECT t.*, g.city_id, g.latitude, g.longitude, g.address, g.map_url
         FROM tournament t
                  JOIN gym g on g.id = t.gym_id
         WHERE t.current = 1`
    );
  }

  setCurrent(id: number) {
    return this.db.run(
        `UPDATE tournament
         SET current = CASE WHEN id = ? THEN 1 ELSE 0 END
         WHERE true`,
        [id]
    );
  }

  getAll() {
    return this.db.all(
        `SELECT t.*, c.name AS city, tt.name AS type_name, g.latitude, g.longitude, g.address, g.map_url
         FROM tournament t
                  JOIN gym g on g.id = t.gym_id
                  JOIN city c ON c.id = g.city_id
                  JOIN tournament_type tt ON tt.id = t.tournament_type_id
         ORDER BY id DESC`
    );
  }

  getById(id: number) {
    return this.db.get(
        `SELECT t.*, c.name AS city, g.city_id, g.latitude, g.longitude, g.address, g.map_url, tt.name AS type_name
         FROM tournament t
                  JOIN gym g on g.id = t.gym_id
                  JOIN city c ON c.id = g.city_id
                  JOIN tournament_type tt ON tt.id = t.tournament_type_id
         WHERE t.id = ?`,
        [id]
    );
  }

  setStatus(status_id: number, id?: number) {
    const result = id ? this.db.run(
            `UPDATE tournament
             SET tournament_status_id = ?
             WHERE id = ?`,
            [status_id, id]
        ) :
        this.db.run(
            `UPDATE tournament
             SET tournament_status_id = ?
             WHERE current = 1`,
            [status_id]
        );
    // старт турнира (2 «Идёт») — создаём чат VK, если его ещё нет;
    // ошибка VK не влияет на смену статуса
    if (status_id === 2) {
      this.createChatIfAbsent(id);
    }
    return result;
  }

  /** Создаёт чат VK для турнира и сохраняет ссылку-приглашение в tournament.chat. */
  createChatIfAbsent(id?: number) {
    const tournament = (id
        ? this.db.get(`SELECT id, name, chat FROM tournament WHERE id = ?`, [id])
        : this.db.get(`SELECT id, name, chat FROM tournament WHERE current = 1`)) as
        { id: number; name: string; chat: string | null } | undefined;
    if (!tournament || tournament.chat) {
      return;
    }
    this.vk.createChat(tournament.name)
        .then((link) => {
          if (link) {
            this.setChat(tournament.id, link);
          }
        })
        .catch((e: Error) => console.error(`чат VK турнира ${tournament.id}:`, e.message));
  }

  setChat(id: number, link: string) {
    return this.db.run(
        `UPDATE tournament
         SET chat = ?
         WHERE id = ?`,
        [link, id]
    );
  }

  setLostStatuses() {
    const lost = this.db.all<{ id: number }>(
        `SELECT id, tournament_status_id AS status, ended_at AS date
         FROM tournament
         WHERE ended_at < datetime('now')
           AND tournament_status_id IN (1, 2)`
    );
    lost.forEach(t => this.setStatus(3, t.id));
    const regEnded = this.db.all<{ id: number }>(
        `SELECT id, tournament_status_id AS status, reg_ended_at AS date
         FROM tournament
         WHERE reg_ended_at < datetime('now')
           AND tournament_status_id = 1`
    );
    regEnded.forEach(t => this.setStatus(2, t.id));
  }

  setDeferredStatusHandlers() {
    // Отложенные задачи на окончания турниров
    const ended = this.db.all<{ id: number; date: string }>(
        `SELECT id, tournament_status_id AS status, ended_at AS date
         FROM tournament
         WHERE ended_at > datetime('now')
           AND tournament_status_id = 2`
    );
    ended.forEach(t => schedule.scheduleJob(new Date(t.date + 'Z'), () => {
      this.setStatus(3, t.id);
    }));

    // Отложенные задачи на окончания регистраций
    const regEnded = this.db.all<{ id: number; date: string }>(
        `SELECT id, tournament_status_id AS status, reg_ended_at AS date
         FROM tournament
         WHERE reg_ended_at > datetime('now')
           AND tournament_status_id = 1`
    );
    regEnded.forEach(t => schedule.scheduleJob(new Date(t.date + 'Z'), () => {
      this.setStatus(2, t.id);
    }));
  }

  isEveryonePaid(id?: number) {
    const data = id ? this.db.get<{ paid: number }>(
        `SELECT count(tu.id) = 0 AS paid
         FROM tournament t
                  JOIN tournament_user tu ON t.id = tu.tournament_id
         WHERE tu.paid = 0
           AND tu.archived = 0
           AND t.id = ?`,
        [id]
    ) : this.db.get<{ paid: number }>(
        `SELECT count(tu.id) = 0 AS paid
         FROM tournament t
                  JOIN tournament_user tu ON t.id = tu.tournament_id
         WHERE tu.paid = 0
           AND tu.archived = 0
           AND t.current = 1`
    );
    return data?.paid;
  }

  pay(user_id: number, paid: number = 1) {
    return this.db.run(
        `UPDATE tournament_user
         SET paid = ?
         WHERE user_id = ?`,
        [paid, user_id]
    );
  }

  hasGames(id?: number) {
    const games = id ? this.db.get<{ has: number }>(
        `SELECT count(id) > 0 AS has
         FROM match
         WHERE tournament_id = ?
           AND finished = 1`,
        [id]
    ) : this.db.get<{ has: number }>(
        `SELECT count(m.id) > 0 AS has
         FROM match m
                  JOIN tournament t ON t.id = m.tournament_id
         WHERE t.current = 1
           AND m.finished = 1`
    );
    return games?.has;
  }

  registeredCount(id?: number) {
    const users = id ? this.db.get<{ count: number }>(
        `SELECT count(id) AS count
         FROM tournament_user
         WHERE tournament_id = ?
           AND archived != 1`,
        [id]
    ) : this.db.get<{ count: number }>(
        `SELECT count(tu.id) AS count
         FROM tournament_user tu
                  JOIN tournament t ON t.id = tu.tournament_id
         WHERE t.current = 1
           AND tu.archived != 1`
    );
    return users?.count;
  }
}

export default Tournament;