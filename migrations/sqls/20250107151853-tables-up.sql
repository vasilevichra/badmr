create table city
(
    id   INTEGER not null primary key autoincrement unique,
    name INTEGER not null unique
);

create table defaults
(
    id          INTEGER not null primary key autoincrement unique,
    name        TEXT    not null unique,
    value       TEXT    not null,
    description TEXT    not null
);

create table tournament
(
    id        INTEGER not null primary key autoincrement unique,
    name      TEXT    not null,
    current   INTEGER not null default 0,
    available INTEGER not null default 1,
    CHECK ("current" IN (0, 1)),
    CHECK ("available" IN (0, 1))
);

create table court
(
    id            INTEGER not null primary key autoincrement unique,
    tournament_id INTEGER not null
        constraint tournament references tournament,
    number        INTEGER not null,
    available     BOOLEAN not null default 1,
    CHECK ("available" IN (0, 1))
);

create table tournament_settings
(
    id            INTEGER not null primary key autoincrement unique,
    defaults_id   INTEGER not null references defaults,
    tournament_id INTEGER not null references tournament,
    value         TEXT    not null
);

create table user
(
    id         INTEGER not null primary key autoincrement unique,
    lastname   TEXT    not null,
    firstname  TEXT    not null,
    patronymic TEXT,
    sex        INTEGER not null,
    city_id    INTEGER not null
        constraint city references city,
    birthday   DATE,
    CHECK ("sex" IN (0, 1))
);

create table user_pic
(
    id      INTEGER not null primary key autoincrement unique,
    user_id INTEGER not null references user,
    pic     TEXT    not null
);

create table tournament_user
(
    id            INTEGER not null primary key autoincrement unique,
    tournament_id INTEGER not null references tournament,
    user_id       INTEGER not null references user,
    available     BOOLEAN not null default 1,
    archived      BOOLEAN not null default 0,
    CHECK ("available" IN (0, 1)),
    CHECK ("archived" IN (0, 1)),
    UNIQUE (tournament_id, user_id)
);

create table match
(
    id            INTEGER  not null primary key autoincrement unique,
    tournament_id INTEGER  not null references tournament,
    created_at    DATETIME not null default current_timestamp,
    user_1_id     INTEGER  not null references user,
    user_2_id     INTEGER  not null references user,
    user_3_id     INTEGER  not null references user,
    user_4_id     INTEGER  not null references user,
    court_id      INTEGER  not null references court,
    finished      INTEGER  not null default 0,
    CHECK ("finished" IN (0, 1))
);

create table game
(
    id         INTEGER  not null primary key autoincrement unique,
    match_id   INTEGER  not null
        constraint match references match,
    created_at DATETIME not null default current_timestamp,
    lost_1_by  INTEGER,
    lost_2_by  INTEGER
);

create table rating
(
    id       INTEGER not null primary key autoincrement unique,
    user_id  INTEGER not null
        constraint user references user,
    game_id  INTEGER
        constraint game references game,
    previous INTEGER not null,
    delta    INTEGER
);