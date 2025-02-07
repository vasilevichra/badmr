INSERT INTO city (id, name)
VALUES (1, 'Доброград'),
       (2, 'Санкт-Петербург'),
       (3, 'Москва'),
       (4, 'Ковров'),
       (5, 'Иваново'),
       (6, 'Владимир'),
       (7, 'Дзержинск');

INSERT INTO defaults (id, name, value, description)
VALUES (1, 'delta', '50', 'Максимальная разница в сумме рейтингов пар при их формировании'),
       (2, 'type', 'RD', 'Тип соревнований: MS, WS, MD, WD, MX, RD, RT, 110'),
       (3, 'wins', '2', 'Сколько игр надо выиграть, чтобы победить в матче');

INSERT INTO tournament (id, name, current, available)
VALUES (1, 'Свободные игры', 1, 1);

INSERT INTO court (id, tournament_id, number, available)
VALUES (1, 1, 1, 1),
       (2, 1, 2, 1),
       (3, 1, 3, 1);

INSERT INTO tournament_settings (id, tournament_id, defaults_id, value)
VALUES (1, 1, 1, 100);