import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import StatsService from "../../src/services/stats.ts";
import Repository from "../../src/repositories/common.ts";
import { clean } from "../helpers/migration.ts";

const statsService = new StatsService();
const db = new Repository().db;

/** Сид контролируемого набора данных:
 *  - турниры 901/902 одного scope (тип 99, wins=2, game_point=21), 903 — wins=3, вне scope;
 *  - пользователи 901-906, города 3 разных, рейтинги двоек у 901-903 и 905;
 *  - матчи 901/902 в турнире 901, 903/904 в турнире 902, 905 вне scope (wins=3). */
describe("Stats (блок «Статистика» главной турнира)", () => {
  let c1: number, c2: number, c3: number;

  beforeEach(async () => {
    await clean();
    [c1, c2, c3] = db.all<{ id: number }>(`SELECT id FROM city ORDER BY id LIMIT 3`).map(r => r.id);

    // идемпотентность: clean() не трогает строки сида, а тестов в сюите
    // несколько — перед вставкой убираем результат прошлого теста
    db.exec(`
      DELETE FROM rating WHERE match_id BETWEEN 901 AND 906;
      DELETE FROM game WHERE id BETWEEN 901 AND 906 OR match_id BETWEEN 901 AND 906;
      DELETE FROM match WHERE id BETWEEN 901 AND 906;
      DELETE FROM court WHERE tournament_id BETWEEN 901 AND 903;
      DELETE FROM tournament_user WHERE tournament_id BETWEEN 901 AND 903;
      DELETE FROM tournament_settings WHERE tournament_id BETWEEN 901 AND 903;
      DELETE FROM tournament WHERE id BETWEEN 901 AND 903;
      DELETE FROM user_lab WHERE user_id BETWEEN 901 AND 906;
      DELETE FROM user WHERE id BETWEEN 901 AND 906;
      DELETE FROM tournament_type WHERE id = 99;

      INSERT INTO tournament_type (id, name) VALUES (99, 'СтатТест');

      INSERT INTO user (id, lastname, firstname, sex, city_id) VALUES
        (901, 'Первый',   'Игрок', 0, ${c1}),
        (902, 'Второй',   'Игрок', 0, ${c1}),
        (903, 'Третий',   'Игрок', 1, ${c2}),
        (904, 'Четвёртый','Игрок', 1, ${c2}),
        (905, 'Пятый',    'Игрок', 0, ${c3}),
        (906, 'Шестой',   'Игрок', 0, ${c3});

      INSERT INTO user_lab (user_id, rating_2) VALUES
        (901, 500), (902, 600), (903, 700), (905, 800);

      INSERT INTO tournament (id, user_id, user_club_id, gym_id, unit_id, tournament_type_id, tournament_status_id,
                              name, current, reg_ended_at, started_at, ended_at)
        VALUES (901, 901, 1, 1, 1, 99, 3, 'Стат A', 0, '2026-01-01 09:00:00', '2026-01-01 12:00:00', '2026-01-01 16:00:00'),
               (902, 901, 1, 1, 1, 99, 3, 'Стат B', 0, '2026-02-01 09:00:00', '2026-02-01 12:00:00', '2026-02-01 16:00:00'),
               (903, 901, 1, 1, 1, 99, 3, 'Стат C', 0, '2026-03-01 09:00:00', '2026-03-01 12:00:00', '2026-03-01 16:00:00');

      INSERT INTO tournament_settings (defaults_id, tournament_id, value)
        SELECT d.id, 901, CASE d.name WHEN 'capacity' THEN '3' WHEN 'wins' THEN '2' ELSE '21' END
        FROM defaults d WHERE d.name IN ('wins', 'game_point', 'capacity');
      INSERT INTO tournament_settings (defaults_id, tournament_id, value)
        SELECT d.id, 902, CASE d.name WHEN 'wins' THEN '2' ELSE '21' END
        FROM defaults d WHERE d.name IN ('wins', 'game_point');
      INSERT INTO tournament_settings (defaults_id, tournament_id, value)
        SELECT d.id, 903, CASE d.name WHEN 'wins' THEN '3' ELSE '21' END
        FROM defaults d WHERE d.name IN ('wins', 'game_point');

      -- регистрации с временем: турнир 901 (capacity 3) набивается за час
      INSERT INTO tournament_user (tournament_id, user_id, available, archived, created_at) VALUES
        (901, 901, 1, 0, '2026-01-01 10:00:00'),
        (901, 902, 1, 0, '2026-01-01 10:30:00'),
        (901, 903, 1, 0, '2026-01-01 11:00:00'),
        (901, 904, 1, 0, '2026-01-01 11:30:00'),
        (902, 902, 1, 0, '2026-02-01 10:00:00'),
        (902, 901, 1, 0, '2026-02-01 10:10:00'),
        (902, 904, 1, 0, '2026-02-01 10:20:00'),
        (902, 905, 1, 0, '2026-02-01 10:30:00'),
        (902, 906, 1, 0, '2026-02-01 10:40:00'),
        (903, 906, 1, 0, '2026-03-01 10:00:00');

      INSERT INTO court (id, tournament_id, number) VALUES (901, 901, 1), (902, 902, 1);

      -- матч 901: пара (901,902) против (903,904), победила (901,902) 2:0, длительность 180с
      INSERT INTO match (id, tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id, created_at, finished)
        VALUES (901, 901, 901, 902, 903, 904, 901, '2026-01-01 12:00:00', 1);
      INSERT INTO game (id, match_id, created_at, lost_1_by, lost_2_by) VALUES
        (901, 901, '2026-01-01 12:01:30', NULL, 1),
        (902, 901, '2026-01-01 12:03:00', NULL, 2);
      -- матч 902: пара (905,906) против (901,902), победила (905,906) 2:0, длительность 180с
      INSERT INTO match (id, tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id, created_at, finished)
        VALUES (902, 901, 905, 906, 901, 902, 901, '2026-01-01 13:00:00', 1);
      INSERT INTO game (id, match_id, created_at, lost_1_by, lost_2_by) VALUES
        (903, 902, '2026-01-01 13:01:00', NULL, 1),
        (904, 902, '2026-01-01 13:03:00', NULL, 1);
      -- матч 903 (турнир 902): пара (901,902) против (905,906), победила (905,906) 2:0, длительность 300с
      INSERT INTO match (id, tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id, created_at, finished)
        VALUES (903, 902, 901, 902, 905, 906, 902, '2026-02-01 12:00:00', 1);
      INSERT INTO game (id, match_id, created_at, lost_1_by, lost_2_by) VALUES
        (905, 903, '2026-02-01 12:02:30', 1, NULL),
        (906, 903, '2026-02-01 12:05:00', 2, NULL);
      -- матч 904 (турнир 902): пара (905,906) против (903,904), победила (905,906) 2:0, длительность 300с
      INSERT INTO match (id, tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id, created_at, finished)
        VALUES (904, 902, 905, 906, 903, 904, 902, '2026-02-01 13:00:00', 1);
      INSERT INTO game (id, match_id, created_at, lost_1_by, lost_2_by) VALUES
        (907, 904, '2026-02-01 13:02:00', NULL, 1),
        (908, 904, '2026-02-01 13:05:00', NULL, 2);
      -- матч 905 вне scope (турнир 903, wins=3) и незавершённый матч 906
      INSERT INTO match (id, tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id, created_at, finished)
        VALUES (905, 903, 901, 902, 903, 904, 901, '2026-03-01 12:00:00', 1);
      INSERT INTO game (id, match_id, created_at, lost_1_by, lost_2_by) VALUES
        (909, 905, '2026-03-01 12:10:00', 3, NULL);
      INSERT INTO match (id, tournament_id, user_1_id, user_2_id, user_3_id, user_4_id, court_id, created_at, finished)
        VALUES (906, 901, 903, 904, 905, 906, 901, '2026-01-01 14:00:00', 0);

      -- дельты рейтинга по матчам
      INSERT INTO rating (user_id, match_id, previous, delta) VALUES
        (901, 901, 500, 10), (902, 901, 600, 10), (903, 901, 700, -10), (904, 901, NULL, -10),
        (905, 902, 800, 5),  (906, 902, NULL, 5),  (901, 902, 510, -5),  (902, 902, 610, -5),
        (901, 903, 505, 7),  (902, 903, 605, 7),  (905, 903, 805, -7),  (906, 903, NULL, -7),
        (905, 904, 798, 3),  (906, 904, NULL, 3), (903, 904, 690, -3),  (904, 904, NULL, -3);
    `);
  });

  it("города: уникальные города участников турнира и scope", async () => {
    assert.deepStrictEqual(statsService.cities(901), {current: 2, all: 3});
  });

  it("участники: в турнире и уникальные в scope", async () => {
    assert.deepStrictEqual(statsService.participants(901), {current: 4, all: 6});
  });

  it("средний рейтинг двоек участников", async () => {
    assert.deepStrictEqual(statsService.avgRating(901), {current: 600, all: 650});
  });

  it("новички: первый турнир типа", async () => {
    // 901: все 4 участника впервые на типе 99; 902: 905 и 906 — впервые
    assert.deepStrictEqual(statsService.newcomers(901), {current: 4, all: 6});
  });

  it("игры и матчи", async () => {
    assert.deepStrictEqual(statsService.games(901), {current: 4, all: 8});
    assert.deepStrictEqual(statsService.matches(901), {current: 2, all: 4});
  });

  it("самая продолжительная игра и матч", async () => {
    // игры турнира 901: 90с, 90с, 60с, 120с; scope: + 150с, 150с, 120с, 180с;
    // глобальный максимум по scope (констрейнт часа ограничивает выбросы)
    assert.deepStrictEqual(statsService.longestGameSeconds(901), {current: 120, all: 180});
    assert.deepStrictEqual(statsService.longestMatchSeconds(901), {current: 180, all: 300});
  });

  it("игр в матче: среднее по scope с теми же wins", async () => {
    // (2+2+2+2)/4 = 2; турнир 903 (wins=3) в scope не участвует
    assert.strictEqual(statsService.avgGamesPerMatchAll(901), 2);
  });

  it("дельта рейтинга: топ прироста и падения за турнир и в scope", async () => {
    // 901: суммы за турнир — 901:+5, 902:+5, 905:+5, 906:+5, 903:-10, 904:-10
    assert.deepStrictEqual(statsService.ratingDelta(901), {riseCurrent: 5, fallCurrent: -10, riseAll: 7, fallAll: -10});
  });

  it("топ винрейта", async () => {
    // в турнире 901: 905 и 906 выиграли оба матча → 100%;
    // в scope: 905/906 — 3 победы в 3 матчах → 100%
    assert.deepStrictEqual(statsService.topWinrate(901), {current: 100, all: 100});
  });

  it("как быстро набивается capacity", async () => {
    // турнир 901 (capacity 3): 10:00 → 11:00 = 3600с; у 902 capacity не достигнут — не считается
    assert.deepStrictEqual(statsService.capacityFillSeconds(901), {current: 3600, all: 3600});
  });
});
