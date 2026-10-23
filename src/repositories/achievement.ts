import Repository from './common.ts';

/**
 * Строка события «игрок — игра»: сырьё для всех номинаций раздела
 * «Достижения». В каждой игре заполнен счёт только проигравшей стороны
 * (lost_1_by — проиграла команда 1, lost_2_by — команда 2), счёт
 * победителя вычисляется по настройкам game_point/max_point.
 * Длительность игры — разность created_at с предыдущей игрой матча
 * (первая — от создания матча), как в истории матчей.
 */
export interface AchievementGameRow {
  user_id: number;
  lastname: string;
  firstname: string;
  sex: number;
  pic: string;
  match_id: number;
  game_id: number;
  /** номер игры в матче (с 1, по id игры) */
  game_no: number;
  /** всего игр в матче */
  games_total: number;
  win: number;
  my_score: number;
  opp_score: number;
  minutes: number;
  match_created_at: string;
  /** матч сыгран в последний час игровой сессии (сессия = дата) */
  deadline: number;
  partner_id: number;
  opp_1_id: number;
  opp_2_id: number;
}

/** Суммарное изменение рейтинга игрока за турнир (из таблицы rating). */
interface AchievementDeltaRow {
  user_id: number;
  delta: number;
}

class Achievement {
  db = new Repository().db;

  /**
   * Все игры завершённых матчей турнира в разрезе игроков.
   *
   * @param tournament_id Турнир «Новая Лига».
   * @param max_point Максимальное количество очков для победы в игре.
   * @param game_point Минимальное количество очков для победы в игре.
   */
  getGamesByTournament = (tournament_id: number, max_point: number, game_point: number): AchievementGameRow[] => this.db.all<AchievementGameRow>(
      `WITH g AS (SELECT g.match_id,
                         g.id                                     AS game_id,
                         g.created_at                             AS game_created_at,
                         m.created_at                             AS match_created_at,
                         m.user_1_id                              AS user_1_id,
                         m.user_2_id                              AS user_2_id,
                         m.user_3_id                              AS user_3_id,
                         m.user_4_id                              AS user_4_id,
                         CASE
                             WHEN g.lost_1_by IS NOT NULL THEN g.lost_1_by
                             WHEN g.lost_2_by < $game_point - 1 THEN $game_point
                             WHEN g.lost_2_by >= $game_point - 1 AND g.lost_2_by < $max_point - 1 THEN g.lost_2_by + 2
                             WHEN g.lost_2_by == $max_point - 1 THEN $max_point END AS score_1,
                         CASE
                             WHEN g.lost_2_by IS NOT NULL THEN g.lost_2_by
                             WHEN g.lost_1_by < $game_point - 1 THEN $game_point
                             WHEN g.lost_1_by >= $game_point - 1 AND g.lost_1_by < $max_point - 1 THEN g.lost_1_by + 2
                             WHEN g.lost_1_by == $max_point - 1 THEN $max_point END AS score_2
                  FROM game g
                           JOIN match m ON m.id = g.match_id
                  WHERE m.tournament_id = $tournament_id
                    AND m.finished = 1),
           gt AS (SELECT g.*,
                         row_number() OVER (PARTITION BY g.match_id ORDER BY g.game_id)   AS game_no,
                         count(*) OVER (PARTITION BY g.match_id)                          AS games_total,
                         max(0, CAST(round((julianday(g.game_created_at) -
                                            julianday(coalesce(LAG(g.game_created_at) OVER (PARTITION BY g.match_id ORDER BY g.game_id), g.match_created_at))) * 1440) AS INT)) AS minutes
                  FROM g g),
           sessions AS (SELECT date(created_at) AS d, max(created_at) AS end
                        FROM match
                        WHERE tournament_id = $tournament_id
                        GROUP BY date(created_at)),
           slots AS (SELECT 1 AS slot, 1 AS team
                     UNION ALL
                     SELECT 2, 1
                     UNION ALL
                     SELECT 3, 2
                     UNION ALL
                     SELECT 4, 2),
           ug AS (SELECT gt.match_id        AS match_id,
                         gt.game_id         AS game_id,
                         gt.game_no         AS game_no,
                         gt.games_total     AS games_total,
                         gt.minutes         AS minutes,
                         gt.match_created_at AS match_created_at,
                         u.lastname         AS lastname,
                         u.firstname        AS firstname,
                         u.sex              AS sex,
                         (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = u.id) AS pic,
                         CASE s.slot WHEN 1 THEN gt.user_1_id WHEN 2 THEN gt.user_2_id WHEN 3 THEN gt.user_3_id
                             ELSE gt.user_4_id END                                   AS user_id,
                         CASE s.slot WHEN 1 THEN gt.user_2_id WHEN 2 THEN gt.user_1_id WHEN 3 THEN gt.user_4_id
                             ELSE gt.user_3_id END                                   AS partner_id,
                         CASE WHEN s.team = 1 THEN gt.user_3_id ELSE gt.user_1_id END AS opp_1_id,
                         CASE WHEN s.team = 1 THEN gt.user_4_id ELSE gt.user_2_id END AS opp_2_id,
                         CASE WHEN s.team = 1 THEN gt.score_1 ELSE gt.score_2 END    AS my_score,
                         CASE WHEN s.team = 1 THEN gt.score_2 ELSE gt.score_1 END    AS opp_score
                  FROM gt
                           JOIN slots s ON 1 = 1
                           JOIN user u ON u.id = CASE s.slot WHEN 1 THEN gt.user_1_id WHEN 2 THEN gt.user_2_id
                      WHEN 3 THEN gt.user_3_id ELSE gt.user_4_id END)
      SELECT ug.user_id,
             ug.lastname,
             ug.firstname,
             ug.sex,
             ug.pic,
             ug.match_id,
             ug.game_id,
             ug.game_no,
             ug.games_total,
             CASE WHEN ug.my_score > ug.opp_score THEN 1 ELSE 0 END      AS win,
             ug.my_score,
             ug.opp_score,
             ug.minutes,
             ug.match_created_at,
             CASE WHEN ug.match_created_at > (SELECT datetime(s.end, '-60 minutes') FROM sessions s
                                              WHERE s.d = date(ug.match_created_at))
                 THEN 1 ELSE 0 END                                       AS deadline,
             ug.partner_id,
             ug.opp_1_id,
             ug.opp_2_id
      FROM ug
      ORDER BY ug.user_id, ug.match_created_at, ug.game_id`,
      {
        $tournament_id: tournament_id,
        $max_point: max_point,
        $game_point: game_point
      }
  );

  /**
   * Суммарное изменение рейтинга по игрокам за завершённые матчи турнира.
   * В rating по 4 строки на матч (по игроку), delta у партнёров одинаковая.
   */
  getDeltasByTournament = (tournament_id: number): AchievementDeltaRow[] => this.db.all<AchievementDeltaRow>(
      `SELECT r.user_id, sum(r.delta) AS delta
       FROM rating r
                JOIN match m ON m.id = r.match_id
       WHERE m.tournament_id = $tournament_id
         AND m.finished = 1
         AND r.delta IS NOT NULL
       GROUP BY r.user_id`,
      {
        $tournament_id: tournament_id
      }
  );
}

export default Achievement;
