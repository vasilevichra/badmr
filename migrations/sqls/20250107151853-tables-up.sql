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

CREATE TABLE defaults
(
    id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    name        TEXT    NOT NULL UNIQUE,
    value       TEXT    NOT NULL,
    description TEXT    NOT NULL
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

CREATE TABLE tournament
(
    id        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    unit_id   INTEGER NOT NULL CONSTRAINT unit REFERENCES unit,
    name      TEXT    NOT NULL,
    current   INTEGER NOT NULL DEFAULT 0,
    available INTEGER not null default 1,
    CHECK (current IN (0, 1)),
    CHECK (available IN (0, 1))
);

CREATE TABLE court
(
    id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    tournament_id INTEGER NOT NULL CONSTRAINT tournament REFERENCES tournament,
    number        INTEGER NOT NULL,
    available     BOOLEAN NOT NULL DEFAULT 1,
    CHECK (available IN (0, 1))
);

CREATE TABLE tournament_settings
(
    id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    defaults_id   INTEGER NOT NULL REFERENCES defaults,
    tournament_id INTEGER NOT NULL REFERENCES tournament,
    value         TEXT    NOT NULL,
    CONSTRAINT tournament_settings_uq UNIQUE (defaults_id, tournament_id)
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
    user_id INTEGER NOT NULL REFERENCES user,
    pic     TEXT    NOT NULL
);

CREATE TABLE tournament_user
(
    id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    tournament_id INTEGER NOT NULL REFERENCES tournament,
    user_id       INTEGER NOT NULL REFERENCES user,
    available     BOOLEAN NOT NULL DEFAULT 1,
    archived      BOOLEAN NOT NULL DEFAULT 0,
    CHECK (available IN (0, 1)),
    CHECK (archived IN (0, 1)),
    UNIQUE (tournament_id, user_id)
);

CREATE TABLE match
(
    id            INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    tournament_id INTEGER  NOT NULL REFERENCES tournament,
    created_at    DATETIME NOT NULL DEFAULT current_timestamp,
    user_1_id     INTEGER  NOT NULL REFERENCES user,
    user_2_id     INTEGER  NOT NULL REFERENCES user,
    user_3_id     INTEGER  NOT NULL REFERENCES user,
    user_4_id     INTEGER  NOT NULL REFERENCES user,
    court_id      INTEGER  NOT NULL REFERENCES court,
    finished      INTEGER  NOT NULL DEFAULT 0,
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

CREATE TABLE rating
(
    id       INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    user_id  INTEGER NOT NULL CONSTRAINT user REFERENCES user,
    game_id  INTEGER CONSTRAINT game REFERENCES game,
    previous INTEGER,
    delta    INTEGER
);
