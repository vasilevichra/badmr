import DB from "../db.ts";
import { testDbPath } from "../test-db.ts";
import Specific from "./specific.ts";
import crypto from "node:crypto";

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
    return this.db.all(
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
}

export default Common;
