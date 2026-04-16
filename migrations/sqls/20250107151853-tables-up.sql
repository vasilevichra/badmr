CREATE TABLE state
(
    id   INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    name TEXT    NOT NULL UNIQUE
);

CREATE TABLE region
(
    id       INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    state_id INTEGER NOT NULL CONSTRAINT state REFERENCES state,
    name     TEXT    NOT NULL UNIQUE
);

CREATE TABLE city
(
    id        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    region_id INTEGER NOT NULL CONSTRAINT region REFERENCES region,
    name      TEXT    NOT NULL UNIQUE
);

CREATE TABLE unit
(
    id        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    name      TEXT    NOT NULL,
    current   INTEGER NOT NULL DEFAULT 0,
    available INTEGER not null default 1,
    CHECK (current IN (0, 1)),
    CHECK (available IN (0, 1))
);

CREATE TABLE tournament_type
(
    id   INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    name TEXT    NOT NULL
);

CREATE TABLE tournament
(
    id                 INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    unit_id            INTEGER NOT NULL CONSTRAINT unit REFERENCES unit,
    tournament_type_id INTEGER NOT NULL CONSTRAINT tournament_type REFERENCES tournament_type,
    name               TEXT    NOT NULL,
    current            INTEGER NOT NULL DEFAULT 0,
    available          INTEGER not null default 1,
    CHECK (current IN (0, 1)),
    CHECK (available IN (0, 1))
);

CREATE TABLE defaults
(
    id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    name        TEXT    NOT NULL UNIQUE,
    value       TEXT    NOT NULL,
    description TEXT    NOT NULL
);

CREATE TABLE tournament_settings
(
    id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    defaults_id   INTEGER NOT NULL CONSTRAINT defaults REFERENCES defaults,
    tournament_id INTEGER NOT NULL CONSTRAINT tournament REFERENCES tournament,
    value         TEXT    NOT NULL,
    CONSTRAINT tournament_settings_uq UNIQUE (defaults_id, tournament_id)
);

CREATE TABLE court
(
    id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    tournament_id INTEGER NOT NULL CONSTRAINT tournament REFERENCES tournament,
    number        INTEGER NOT NULL,
    available     BOOLEAN NOT NULL DEFAULT 1,
    CHECK (available IN (0, 1))
);

CREATE TABLE "group"
(
    id   INTEGER     NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE user
(
    id              INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    lastname        TEXT    NOT NULL,
    firstname       TEXT    NOT NULL,
    patronymic      TEXT,
    phone           TEXT UNIQUE,
    email           TEXT UNIQUE,
    hashed_password BLOB,
    salt            BLOB,
    sex             INTEGER NOT NULL,
    city_id         INTEGER NOT NULL CONSTRAINT city REFERENCES city,
    birthday        DATE,
    CHECK (phone GLOB '+79[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    CHECK (email LIKE '%_@_%._%' AND LENGTH(email) - LENGTH(REPLACE(email, '@', '')) = 1 AND
           SUBSTR(LOWER(email), 1, INSTR(email, '.') - 1) NOT GLOB '*[^@0-9a-z]*' AND
           SUBSTR(LOWER(email), INSTR(email, '.') + 1) NOT GLOB '*[^a-z]*' ),
    CHECK (sex IN (0, 1))
);

CREATE TABLE user_pic
(
    id      INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    user_id INTEGER NOT NULL CONSTRAINT user REFERENCES user,
    pic     TEXT    NOT NULL
);

CREATE TABLE user_lab
(
    id         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    user_id    INTEGER NOT NULL CONSTRAINT user REFERENCES user,
    site_id    INTEGER NOT NULL,
    site_login TEXT,
    site_name  TEXT,
    rating_1   INTEGER,
    rating_2   INTEGER NOT NULL,
    img        TEXT,
    city       TEXT,
    club       TEXT,
    year       INTEGER,
    UNIQUE (user_id, site_id)
);

CREATE TABLE tournament_user
(
    id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    tournament_id INTEGER NOT NULL CONSTRAINT tournament REFERENCES tournament,
    user_id       INTEGER NOT NULL CONSTRAINT user REFERENCES user,
    available     BOOLEAN NOT NULL DEFAULT 1,
    archived      BOOLEAN NOT NULL DEFAULT 0,
    CHECK (available IN (0, 1)),
    CHECK (archived IN (0, 1)),
    UNIQUE (tournament_id, user_id)
);

CREATE TABLE "match"
(
    id            INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    tournament_id INTEGER  NOT NULL CONSTRAINT tournament REFERENCES tournament,
    created_at    DATETIME NOT NULL DEFAULT current_timestamp,
    user_1_id     INTEGER  NOT NULL CONSTRAINT user1 REFERENCES user,
    user_2_id     INTEGER  NOT NULL CONSTRAINT user2 REFERENCES user,
    user_3_id     INTEGER  NOT NULL CONSTRAINT user3 REFERENCES user,
    user_4_id     INTEGER  NOT NULL CONSTRAINT user4 REFERENCES user,
    court_id      INTEGER  NOT NULL CONSTRAINT court REFERENCES court,
    finished      INTEGER  NOT NULL DEFAULT 0,
    CHECK (finished IN (0, 1))
);

CREATE TABLE match_110
(
    id            INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    tournament_id INTEGER  NOT NULL CONSTRAINT tournament REFERENCES tournament,
    created_at    DATETIME NOT NULL DEFAULT current_timestamp,
    team_1_id     INTEGER  NOT NULL CONSTRAINT team1 REFERENCES team,
    team_2_id     INTEGER  NOT NULL CONSTRAINT team2 REFERENCES team,
    court_id      INTEGER  NOT NULL CONSTRAINT court REFERENCES court,
    finished       INTEGER  NOT NULL DEFAULT 0,
    CHECK (finished IN (0, 1))
);

CREATE TABLE game
(
    id         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    match_id   INTEGER  NOT NULL CONSTRAINT match REFERENCES match,
    created_at DATETIME NOT NULL DEFAULT current_timestamp,
    lost_1_by  INTEGER,
    lost_2_by  INTEGER
);

CREATE TABLE game_110
(
    id           INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    match_110_id INTEGER  NOT NULL CONSTRAINT match_110 REFERENCES match_110,
    created_at   DATETIME NOT NULL DEFAULT current_timestamp,
    game_type_id INTEGER  NOT NULL CONSTRAINT game_type REFERENCES game_type,
    score_1      INTEGER  NOT NULL DEFAULT 0,
    score_2      INTEGER  NOT NULL DEFAULT 0,
    current      INTEGER NOT NULL DEFAULT 0,
    CHECK (current IN (0, 1)),
    CHECK (score_1 >= 0 AND score_1 <= 110),
    CHECK (score_2 >= 0 AND score_2 <= 110)
);

CREATE TABLE game_type
(
    id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL,
    UNIQUE (name),
    UNIQUE (description)
);

CREATE TABLE rating
(
    id       INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    user_id  INTEGER NOT NULL CONSTRAINT user REFERENCES user,
    match_id INTEGER CONSTRAINT match REFERENCES match,
    previous INTEGER,
    delta    INTEGER
);

CREATE TABLE team_color
(
    id   INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    hex  TEXT    NOT NULL,
    name TEXT    NOT NULL
);

CREATE TABLE team
(
    id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    tournament_id INTEGER NOT NULL CONSTRAINT tournament REFERENCES tournament,
    group_id      INTEGER NOT NULL CONSTRAINT "group" REFERENCES "group",
    name          TEXT    NOT NULL,
    city_id       INTEGER NOT NULL CONSTRAINT city REFERENCES city,
    team_color_id INTEGER NOT NULL CONSTRAINT team_color REFERENCES team_color,
    UNIQUE (tournament_id, city_id, name),
    UNIQUE (tournament_id, group_id, team_color_id)
);

CREATE TABLE team_user
(
    id       INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    team_id  INTEGER NOT NULL CONSTRAINT team REFERENCES team,
    user_id  INTEGER NOT NULL CONSTRAINT user REFERENCES user,
    group_id INTEGER NOT NULL CONSTRAINT "group" REFERENCES "group"
);

CREATE TABLE team_order_110
(
    id      INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    team_id INTEGER NOT NULL CONSTRAINT team REFERENCES team,
    ms1     INTEGER NULL CONSTRAINT ms1  REFERENCES team_user,
    ws1     INTEGER NULL CONSTRAINT ws1  REFERENCES team_user,
    md11    INTEGER NULL CONSTRAINT md11 REFERENCES team_user,
    md12    INTEGER NULL CONSTRAINT md12 REFERENCES team_user,
    wd11    INTEGER NULL CONSTRAINT wd11 REFERENCES team_user,
    wd12    INTEGER NULL CONSTRAINT wd12 REFERENCES team_user,
    xd11    INTEGER NULL CONSTRAINT xd11 REFERENCES team_user,
    xd12    INTEGER NULL CONSTRAINT xd12 REFERENCES team_user,
    ms2     INTEGER NULL CONSTRAINT ms2  REFERENCES team_user,
    ws2     INTEGER NULL CONSTRAINT ws2  REFERENCES team_user,
    md21    INTEGER NULL CONSTRAINT md21 REFERENCES team_user,
    md22    INTEGER NULL CONSTRAINT md22 REFERENCES team_user,
    wd21    INTEGER NULL CONSTRAINT wd21 REFERENCES team_user,
    wd22    INTEGER NULL CONSTRAINT wd22 REFERENCES team_user,
    xd21    INTEGER NULL CONSTRAINT xd21 REFERENCES team_user,
    xd22    INTEGER NULL CONSTRAINT xd22 REFERENCES team_user,
    UNIQUE (team_id),
    CHECK (md11 != md12),
    CHECK (wd11 != wd12),
    CHECK (md21 != md22),
    CHECK (wd21 != wd22),
    CHECK (ms1 != ms2),
    CHECK (ws1 != ws2)
);
