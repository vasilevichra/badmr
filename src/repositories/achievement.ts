import Repository from './common.ts';

interface AchievementUserRow {
  user_id: number;
  lastname: string;
  firstname: string;
  sex: number;
  pic: string;
  match_wins: number;
  match_losses: number;
  match_trier: number;
  points: number;
  iron_nerves: number;
  minutes: number;
}

class Achievement {
  db = new Repository().db;

  /**
   * Статистика игроков по завершённым матчам турнира — сырьё для номинаций.
   *
   * В каждой игре заполнен счёт только проигравшей стороны (lost_1_by —
   * проиграла команда 1, lost_2_by — команда 2), счёт победителя
   * вычисляется по настройкам game_point/max_point. Длительность игры —
   * разность created_at с предыдущей игрой матча (первая — от создания
   * матча), как в истории матчей.
   *
   * @param tournament_id Турнир «Новая Лига».
   * @param max_point Максимальное количество очков для победы в игре.
   * @param game_point Минимальное количество очков для победы в игре.
   */
  getStatsByTournament = (tournament_id: number, max_point: number, game_point: number): AchievementUserRow[] => this.db.all<AchievementUserRow>(
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
                         max(0, CAST(round((julianday(g.game_created_at) -
                                            julianday(coalesce(LAG(g.game_created_at) OVER (PARTITION BY g.match_id ORDER BY g.game_id), g.match_created_at))) * 1440) AS INT)) AS minutes
                  FROM g g),
           ms AS (SELECT match_id,
                         sum(score_1)             AS s1,
                         sum(score_2)             AS s2,
                         sum(score_1 > score_2)   AS w1,
                         sum(score_2 > score_1)   AS w2
                  FROM gt
                  GROUP BY match_id),
           slots AS (SELECT 1 AS slot, 1 AS team
                     UNION ALL
                     SELECT 2, 1
                     UNION ALL
                     SELECT 3, 2
                     UNION ALL
                     SELECT 4, 2),
           ug AS (SELECT gt.match_id     AS match_id,
                         gt.minutes      AS minutes,
                         s.team          AS team,
                         CASE s.slot
                             WHEN 1 THEN gt.user_1_id
                             WHEN 2 THEN gt.user_2_id
                             WHEN 3 THEN gt.user_3_id
                             ELSE gt.user_4_id END                     AS user_id,
                         CASE WHEN s.team = 1 THEN gt.score_1 ELSE gt.score_2 END AS my_score,
                         CASE WHEN s.team = 1 THEN gt.score_2 ELSE gt.score_1 END AS opp_score
                  FROM gt
                           JOIN slots s ON 1 = 1),
           um AS (SELECT ug.user_id AS user_id,
                         ug.match_id AS match_id,
                         ug.team AS team,
                         sum(ug.my_score) AS mp
                  FROM ug
                  GROUP BY ug.user_id, ug.match_id, ug.team),
           user_stats AS (SELECT um.user_id                          AS user_id,
                                 sum(CASE
                                         WHEN (um.team = 1 AND ms.w1 > ms.w2) OR (um.team = 2 AND ms.w2 > ms.w1)
                                             THEN 1 ELSE 0 END)      AS match_wins,
                                 sum(CASE
                                         WHEN (um.team = 1 AND ms.w1 < ms.w2) OR (um.team = 2 AND ms.w2 < ms.w1)
                                             THEN 1 ELSE 0 END)      AS match_losses,
                                 sum(CASE
                                         WHEN ((um.team = 1 AND ms.w1 < ms.w2) OR (um.team = 2 AND ms.w2 < ms.w1))
                                             AND um.mp > CASE WHEN um.team = 1 THEN ms.s2 ELSE ms.s1 END
                                             THEN 1 ELSE 0 END)      AS match_trier
                          FROM um
                                   JOIN ms ON ms.match_id = um.match_id
                          GROUP BY um.user_id)
      SELECT u.id                                                     AS user_id,
             u.lastname                                               AS lastname,
             u.firstname                                              AS firstname,
             u.sex                                                    AS sex,
             (SELECT coalesce(pic, '') FROM user_pic WHERE user_id = u.id) AS pic,
             coalesce(us.match_wins, 0)                               AS match_wins,
             coalesce(us.match_losses, 0)                             AS match_losses,
             coalesce(us.match_trier, 0)                              AS match_trier,
             coalesce(gg.points, 0)                                   AS points,
             coalesce(gg.iron_nerves, 0)                              AS iron_nerves,
             coalesce(gg.minutes, 0)                                  AS minutes
      FROM user u
               JOIN (SELECT user_id,
                            sum(my_score)                            AS points,
                            sum(CASE
                                    WHEN my_score > opp_score AND my_score >= $game_point + 1
                                        THEN 1 ELSE 0 END)           AS iron_nerves,
                            sum(minutes)                             AS minutes
                     FROM ug
                     GROUP BY user_id) gg ON gg.user_id = u.id
               LEFT JOIN user_stats us ON us.user_id = u.id
      ORDER BY u.id`,
      {
        $tournament_id: tournament_id,
        $max_point: max_point,
        $game_point: game_point
      }
  );
}

export default Achievement;
