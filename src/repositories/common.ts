import DB from "../db.ts";
import { testDbPath } from "../test-db.ts";
import Specific from "./specific.ts";
import crypto from "node:crypto";

export interface ReadyRow {
  user_id: number;
  rating: number;
  matches: number;
  played: number;
  // исход последнего матча: 1 - выиграл, 0 - проиграл, null - не играл
  won: number | null;
  // выигранные матчи на турнире
  wins: number;
  sex: number;
  pic: string | null;
}

export interface CalculatedPair {
  players1: { user_id: number }[];
  players2: { user_id: number }[];
  diff?: number;
  matches?: number;
  played?: number;
  // «Шанс» пары — винрейт совместных доигранных матчей напарников
  // в процентах; null — вместе не играли
  chance1?: number | null;
  chance2?: number | null;
  // сумма шансов обеих пар — метрика friends-приоритета
  friends?: number;
  // система 50%: фаворит матчапа по моментуму — 1 (players1), 2 (players2),
  // 0 (нейтральный); проставляется только при включённой fifty
  favorite?: 0 | 1 | 2;
}

class Common {
  declare static _instance: Common | undefined;
  db!: DB;

  constructor() {
    if (Common._instance) {
      return Common._instance;
    }
    Common._instance = this;

    this.db = new DB(process.env.NODE_ENV === 'test' ? testDbPath() : './.data/badmr.sqlite3');
    // create an initial users
    const salt = crypto.randomBytes(16);
    (Specific.users || []).forEach(u => {
      this.db.run('UPDATE user SET hashed_password = ?, salt = ? WHERE id = ?', [
        crypto.pbkdf2Sync(u.password, salt, 310000, 32, 'sha256'),
        salt,
        u.id
      ]);
    });
  }

  ready(calculated_objects: CalculatedPair[][] = [], tournamentId?: number) {
    const uniqUsedUserIds = [...new Set(
        calculated_objects
        .flat(1)
        .map(obj =>
            obj.players1.map(p => p.user_id).concat(obj.players2.map(p => p.user_id))
        )
        .flat(1)
    )];

    // пол и аватар нужны клиенту сразу (подбор рисует карточки игроков);
    // пользовательские подзапросы вместо JOIN: user_lab/user_pic могут
    // хранить несколько строк на игрока — JOIN размножил бы кандидатов;
    // порядок повторяет ORDER BY вьюхи ready: сам по себе он через JOIN
    // не гарантируется, а от него зависит перебор кандидатов в calcReadyRec
    return this.db.all<ReadyRow>(
        `SELECT r.*,
                u.sex,
                coalesce((SELECT up.pic FROM user_pic up WHERE up.user_id = r.user_id ORDER BY up.id DESC LIMIT 1),
                         (SELECT ul.img FROM user_lab ul WHERE ul.user_id = r.user_id ORDER BY ul.id DESC LIMIT 1)) AS pic
         FROM ready r
         JOIN user u ON u.id = r.user_id
         WHERE r.tournament_id = coalesce(?, (SELECT id FROM tournament WHERE current = 1))
           AND r.user_id NOT IN (SELECT value FROM json_each(?))
         ORDER BY r.played, r.matches DESC`,
        [tournamentId ?? null, JSON.stringify(uniqUsedUserIds)]
    );
  }

  /** Составы последних завершённых матчей турнира — для штрафа за
   *  повторные встречи (поля rematch подбора). */
  recentFinished(tournamentId: number | undefined, limit: number) {
    return this.db.all<{
      user_1_id: number;
      user_2_id: number;
      user_3_id: number;
      user_4_id: number;
    }>(
        `SELECT user_1_id, user_2_id, user_3_id, user_4_id
         FROM match
         WHERE finished = 1
           AND tournament_id = coalesce(?, (SELECT id FROM tournament WHERE current = 1))
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [tournamentId ?? null, limit]
    );
  }

  /** История завершённых матчей для модели конкурентности:
   *  previous каждой строки rating — рейтинг игрока ДО матча,
   *  lost_1_by/lost_2_by — счёт по играм (2:1 → матч в три игры). */
  threeGameHistory(tournamentId: number | undefined) {
    return this.db.all<{
      p1: number;
      p2: number;
      p3: number;
      p4: number;
      lost_1: number;
      lost_2: number;
    }>(
        `SELECT r1.previous AS p1,
                r2.previous AS p2,
                r3.previous AS p3,
                r4.previous AS p4,
                (SELECT count(lost_1_by) FROM game WHERE match_id = m.id) AS lost_1,
                (SELECT count(lost_2_by) FROM game WHERE match_id = m.id) AS lost_2
         FROM match m
                  JOIN rating r1 ON r1.match_id = m.id AND r1.user_id = m.user_1_id
                  JOIN rating r2 ON r2.match_id = m.id AND r2.user_id = m.user_2_id
                  JOIN rating r3 ON r3.match_id = m.id AND r3.user_id = m.user_3_id
                  JOIN rating r4 ON r4.match_id = m.id AND r4.user_id = m.user_4_id
         WHERE m.finished = 1
           AND m.tournament_id = coalesce(?, (SELECT id FROM tournament WHERE current = 1))
         ORDER BY m.id`,
        [tournamentId ?? null]
    );
  }
}

export default Common;
