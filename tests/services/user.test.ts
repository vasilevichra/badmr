import assert from "node:assert/strict";
import { describe, it, beforeEach, after } from "node:test";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { testDbPath } from "../../src/test-db.ts";
import UserService from "../../src/services/user.ts";
import UserRepository from "../../src/repositories/user.ts";
import MatchService from "../../src/services/match.ts";
import GameService from "../../src/services/game.ts";
import TournamentService from "../../src/services/tournament.ts";
import Repository from "../../src/repositories/common.ts";
import SettingsService from "../../src/services/settings.ts";
import { clean } from "../helpers/migration.ts";

interface UserRow {
  id: number;
  lastname: string;
  firstname: string;
  patronymic: string | null;
  age: number;
  sex: number;
  pic: string | null;
  city_id: number;
  site_id: number | null;
  site_login: string | null;
  club: string | null;
}

interface PlayerRow {
  id: number;
  name: string;
  rating: number;
  enabled: number;
  paid: number;
  matches: number;
}

interface ArchivedRow {
  id: number;
  name: string;
  sex: number;
  pic: string | null;
  city: string;
  tournament_id: number;
}

interface FoundRow {
  id: number;
  lastname: string;
  firstname: string;
  patronymic: string | null;
  sex: number;
  pic: string | null;
  city: string;
}

interface CoPlayerRow {
  user_id: number;
  user_name: string;
  user_sex: number | null;
  user_pic: string | null;
  win_count?: number;
  lose_count?: number;
}

interface BuddyRow {
  user_id: number;
  user_name: string;
  user_sex: number | null;
  user_pic: string | null;
  win_rate: string;
}

interface WorstOpponentRow {
  user_id: number;
  user_name: string;
  user_sex: number | null;
  user_pic: string | null;
  lose_rate: string;
}

interface SelectRow {
  id: number;
  text: string;
}

interface LabPlayer {
  user_id: number;
  id: number;
  img: string | null;
  r1: number | null;
  r2: number | null;
  name: string;
  login: string | null;
  club: string | null;
  city: string | null;
  year: number | null;
}

const userService = new UserService();
const userRepository = new UserRepository();
const matchService = new MatchService();
const gameService = new GameService();
const tournamentService = new TournamentService();
const db = new Repository().db;

// повторное создание сервиса должно вернуть существующий singleton
new UserService();

const cleanAll = async (): Promise<void> => {
  await clean();
};

const mkUser = async (n: number, rating: number): Promise<number> => {
  const { id } = await userService.create(
    `Фамилия${n}`,
    `Имя${n}`,
    "Отчество",
    rating,
    1,
    1,
    "1990-01-01",
  );
  return id;
};

const seedUsers = async (
  ratings: number[] = [500, 500, 500, 500],
): Promise<number[]> => {
  const ids: number[] = [];
  for (let i = 0; i < ratings.length; i++) {
    ids.push(await mkUser(i + 1, ratings[i]));
  }
  // в сиде уже есть регистрации на текущий турнир — оставляем только созданных
  await userService.deregisterAll();
  await userService.registerByIds(ids);
  return ids;
};

// создаёт 4 пользователей, регистрирует их, создаёт и завершает матч
// (пара 1 проиграла обе игры)
const seedFinishedMatch = async (
  ratings: number[] = [500, 500, 500, 500],
): Promise<{ ids: number[]; matchId: number }> => {
  const ids = await seedUsers(ratings);
  await matchService.create(...(ids as [number, number, number, number]));
  const match = (await matchService.getAll() as { id: number }[])[0];
  await gameService.create(match.id, "15", null, "2026-01-01 10:00:00");
  await gameService.create(match.id, "17", null, "2026-01-01 10:05:00");
  return { ids, matchId: match.id };
};

// <a>-строка в результатах поиска badminton4u.ru (POST /ajax?search=rating&s=d)
const siteRow = (overrides: Record<string, string> = {}): string => {
  const row = {
    id: "12345",
    name: "Иванов Иван",
    login: "login",
    city: "г. Доброград",
    rating: "520",
    ...overrides,
  };
  return `<a href="/players/${row.id}"><span>1</span><span><bdo></bdo></span><span><b>${row.name}</b>${row.login}</span><span>${row.city}</span><span><dfn data-type="d">${row.rating}</dfn></span><span>01.01.26</span></a>`;
};

// страница игрока badminton4u.ru (POST /players/<id> с only=main)
const playerPage = (overrides: Record<string, string> = {}): string => {
  const page = {
    id: "12345",
    name: "Иванов Иван",
    login: "login",
    singles: "500",
    doubles: "520",
    club: "Клуб",
    city: "г. Доброград",
    birth: "1 января 1990",
    avatar: "badm/users/12345/mini-avatar.webp?1788129740",
    ...overrides,
  };
  return `<header><bdo style="background-image:url(${page.avatar})"></bdo><h1>${page.name} </h1><h2>@${page.login}</h2><dfn data-type="s">${page.singles}</dfn><dfn data-type="d">${page.doubles}</dfn></header><a data-u="club" href="/clubs/1">${page.club}</a><section id="info"><p class="address">${page.city}</p><p class="birth">${page.birth}</p></section>`;
};

const noRows = `<p class="no-found">По вашему запросу ничего не найдено</p>`;

const fetchedUrls: string[] = [];

// поиск возвращает searchHtml (или вариант из searchByTitle по значению title),
// любая другая ссылка считается страницей игрока и возвращает playerHtml
const mockFetch = (
  searchHtml: string,
  playerHtml: string = playerPage(),
  searchByTitle: Record<string, string> = {},
  // байты аватара для GET /badm/users/...; null — сайт отвечает не-2xx
  avatarBytes: Uint8Array | null = new Uint8Array([1, 2, 3, 4]),
): void => {
  fetchedUrls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    fetchedUrls.push(url);
    if (url.includes("/badm/users/")) {
      if (!avatarBytes) {
        return {ok: false, status: 404} as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => avatarBytes.buffer,
        headers: {get: () => "image/webp"},
      } as unknown as Response;
    }
    let html: string;
    if (url.includes("/ajax?search=rating")) {
      const title = decodeURIComponent(String(init?.body ?? "").replace(/^title=/, "").replace(/&s=d$/, ""));
      html = searchByTitle[title] ?? searchHtml;
    } else {
      html = playerHtml;
    }
    return { json: async () => ({ html }) } as unknown as Response;
  }) as unknown as typeof fetch;
};

describe("User", () => {
  const originalFetch = globalThis.fetch;

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(async () => {
    console.log = function () {};
    await cleanAll();
    // точные рейтинги в тестах посчитаны при фиксированном K —
    // калибровка здесь не тестируется, отключаем её
    await new SettingsService().set("calibration_matches", "0");
  });

  describe("create, getById", () => {
    it("должен создать пользователя и вернуть его по id", async () => {
      const id = await mkUser(1, 500);

      const user = await userService.getById(id) as UserRow;
      assert.strictEqual(user.id, id);
      assert.strictEqual(user.lastname, "Фамилия1");
      assert.strictEqual(user.firstname, "Имя1");
      assert.strictEqual(user.patronymic, "Отчество");
      assert.strictEqual(user.sex, 1);
      assert.strictEqual(user.city_id, 1);
      assert.strictEqual(typeof user.age, "number");
      assert.strictEqual(user.pic, null);
      assert.strictEqual(user.site_id, null);
      assert.strictEqual(user.site_login, null);
      assert.strictEqual(user.club, null);
    });

    it("должен вернуть пустой ответ для несуществующего пользователя", async () => {
      assert.strictEqual(await userService.getById(999), undefined);
    });
  });

  describe("getAll", () => {
    it("должен вернуть зарегистрированных игроков", async () => {
      const ids = await seedUsers();

      const players = await userService.getAll() as unknown as PlayerRow[];
      assert.strictEqual(players.length, 4);
      const first = players.find((p) => p.id === ids[0])!;
      assert.strictEqual(first.name, "Фамилия1 Имя1");
      assert.strictEqual(first.rating, 500);
      assert.strictEqual(first.enabled, 1);
      assert.strictEqual(first.paid, 0);
      assert.strictEqual(first.matches, 0);
    });

    it("должен вернуть пустой список когда никто не зарегистрирован", async () => {
      await mkUser(1, 500);
      // в сиде текущий турнир уже содержит регистрации — убираем их
      await userService.deregisterAll();

      assert.deepStrictEqual(await userService.getAll(), []);
    });
  });

  describe("select", () => {
    it("должен вернуть пользователей города без команды", async () => {
      const ids = await seedUsers();

      const selected = await userService.select(1) as unknown as SelectRow[];
      // в сиде есть другие пользователи города 1 без команды —
      // созданные должны быть среди выбранных
      assert.deepStrictEqual<number[]>(
        selected.filter((u) => u.text.startsWith("Фамилия")).map((u) => u.id),
        ids,
      );
    });

    it("должен вернуть пустой список для города без пользователей", async () => {
      await seedUsers();

      // свой город: дамп 05-specific перегенерируется из живой базы,
      // и «свободный» город из словаря может получить пользователя
      const db = new DatabaseSync(testDbPath(), {enableForeignKeyConstraints: false});
      db.exec(`INSERT OR IGNORE INTO city (id, region_id, name) VALUES (900001, 1, 'Тестоград')`);

      assert.deepStrictEqual(await userService.select(900001), []);
    });
  });

  describe("findBy", () => {
    it("должен найти по фамилии", async () => {
      await seedUsers();

      const found = await userService.findBy("Фамилия1", "", "") as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].lastname, "Фамилия1");
      assert.strictEqual(found[0].city, "Доброград");
    });

    it("должен найти по фамилии и началу имени", async () => {
      await seedUsers();

      const found = await userService.findBy("Фамилия1", "Имя", "") as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].firstname, "Имя1");
    });

    it("должен найти по фамилии, имени и началу отчества", async () => {
      await seedUsers();

      const found = await userService.findBy("Фамилия1", "Имя1", "Отч") as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].patronymic, "Отчество");
    });

    it("должен найти нескольких по маске фамилии", async () => {
      await seedUsers();

      const found = await userService.findBy("Фамилия", "", "") as unknown as FoundRow[];
      assert.strictEqual(found.length, 4);
    });

    it("должен найти по фамилии с ё в базе при запросе с е", async () => {
      const { id } = await userService.create("Соловьёва", "Виктория", "", 500, 1, 1, "1990-01-01");

      const found = await userService.findBy("Соловьева", "", "") as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
    });

    it("должен найти по фамилии с е в базе при запросе с ё", async () => {
      const { id } = await userService.create("Соловьева", "Виктория", "", 500, 1, 1, "1990-01-01");

      const found = await userService.findBy("Соловьёва", "", "") as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
    });

    it("должен найти по фамилии с ё при частичном запросе", async () => {
      const { id } = await userService.create("Соловьёва", "Виктория", "", 500, 1, 1, "1990-01-01");

      const found = await userService.findBy("Соловь", "", "") as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
    });

    it("должен найти по имени с ё при запросе с е", async () => {
      const { id } = await userService.create("Фамилия1", "Пётр", "", 500, 1, 1, "1990-01-01");

      const found = await userService.findBy("Фамилия1", "Петр", "") as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
    });

    it("без отчества при нескольких вариантах должен вернуть совпадающих по городу", async () => {
      const { id } = await userService.create("Соловьева", "Виктория", "", 500, 1, 1, "1990-01-01");
      await userService.create("Соловьева", "Виктория", "", 500, 0, 2, "1990-01-01");

      const found = await userService.findBy("Соловьева", "Виктория", "", 1) as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
    });

    it("без отчества, если в этом городе нет совпадений, должен вернуть все варианты", async () => {
      await userService.create("Соловьева", "Виктория", "", 500, 1, 2, "1990-01-01");
      await userService.create("Соловьева", "Виктория", "", 500, 0, 2, "1990-01-01");

      const found = await userService.findBy("Соловьева", "Виктория", "", 1) as unknown as FoundRow[];
      assert.strictEqual(found.length, 2);
    });

    it("без отчества единственный вариант должен вернуть без учёта города", async () => {
      const { id } = await userService.create("Соловьева", "Виктория", "", 500, 1, 2, "1990-01-01");

      const found = await userService.findBy("Соловьева", "Виктория", "", 1) as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
    });

    it("с отчеством при пустом результате должен искать по фамилии, имени и городу", async () => {
      const { id } = await userService.create("Соловьева", "Виктория", "Геннадьевна", 500, 1, 2, "1990-01-01");

      const found = await userService.findBy("Соловьева", "Виктория", "Ивановна", 2) as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
    });

    it("с отчеством точное совпадение должно иметь приоритет над городом", async () => {
      const { id } = await userService.create("Соловьева", "Виктория", "Геннадьевна", 500, 1, 2, "1990-01-01");
      await userService.create("Соловьева", "Виктория", "", 500, 0, 1, "1990-01-01");

      const found = await userService.findBy("Соловьева", "Виктория", "Геннадьевна", 1) as unknown as FoundRow[];
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, id);
    });

    it("с отчеством без города fallback не должен выполняться", async () => {
      await userService.create("Соловьева", "Виктория", "Геннадьевна", 500, 1, 2, "1990-01-01");

      const found = await userService.findBy("Соловьева", "Виктория", "Ивановна") as unknown as FoundRow[];
      assert.strictEqual(found.length, 0);
    });
  });

  describe("registerAll, registerByIds, isRegistered", () => {
    it("должен зарегистрировать всех и проверить регистрацию", async () => {
      const ids = await seedUsers();

      for (const id of ids) {
        assert.deepStrictEqual(await userService.isRegistered(id), {
          registered: 1,
        });
      }
    });

    it("должен перерегистрировать выбранных после снятия регистрации", async () => {
      const ids = await seedUsers();
      await userService.deregisterAll();

      assert.deepStrictEqual(await userService.isRegistered(ids[0]), {
        registered: 0,
      });

      await userService.registerByIds([ids[0], ids[1]]);
      assert.deepStrictEqual(await userService.isRegistered(ids[0]), {
        registered: 1,
      });
      assert.deepStrictEqual(await userService.isRegistered(ids[2]), {
        registered: 0,
      });
    });
  });

  describe("deregisterAll, deregisterByIds", () => {
    it("должен снять регистрацию со всех", async () => {
      const ids = await seedUsers();
      await userService.deregisterAll();

      assert.deepStrictEqual(await userService.getAll(), []);
      assert.deepStrictEqual(await userService.isRegistered(ids[0]), {
        registered: 0,
      });
    });

    it("должен снять регистрацию у выбранных", async () => {
      const ids = await seedUsers();
      await userService.deregisterByIds([ids[0], ids[1]]);

      const players = await userService.getAll() as unknown as PlayerRow[];
      assert.deepStrictEqual<number[]>(players.map((p) => p.id), [ids[2], ids[3]]);
    });
  });

  describe("enable, disable", () => {
    it("должен отключить и включить выбранных игроков", async () => {
      const ids = await seedUsers();
      await userService.disable([ids[0], ids[1]]);

      let players = await userService.getAll() as unknown as PlayerRow[];
      assert.strictEqual(players.find((p) => p.id === ids[0])!.enabled, 0);
      assert.strictEqual(players.find((p) => p.id === ids[2])!.enabled, 1);

      await userService.enable([ids[0]]);

      players = await userService.getAll() as unknown as PlayerRow[];
      assert.strictEqual(players.find((p) => p.id === ids[0])!.enabled, 1);
      assert.strictEqual(players.find((p) => p.id === ids[1])!.enabled, 0);
    });
  });

  describe("archive, unarchive, archiveAll, unarchiveAll, getArchived", () => {
    it("должен архивировать и разархивировать пользователя", async () => {
      const ids = await seedUsers();
      await userService.archive(ids[0]);

      const archived = await userService.getArchived() as unknown as ArchivedRow[];
      assert.deepStrictEqual<ArchivedRow[]>(archived, [{
        id: ids[0],
        name: "Фамилия1 Имя1",
        sex: 1,
        pic: null,
        city: "Доброград",
        // выборка текущего турнира (сид, current = 4)
        tournament_id: 4,
      }]);
      let players = await userService.getAll() as unknown as PlayerRow[];
      assert.strictEqual(players.length, 3);

      await userService.unarchive(ids[0]);

      assert.deepStrictEqual(await userService.getArchived(), []);
      players = await userService.getAll() as unknown as PlayerRow[];
      assert.strictEqual(players.length, 4);
    });

    it("должен восстановить доступность и заархивировать всех", async () => {
      const ids = await seedUsers();
      await userService.disable([ids[0]]);

      // unarchiveAll восстанавливает available у незархивированных игроков
      await userService.unarchiveAll();
      let players = await userService.getAll() as unknown as PlayerRow[];
      assert.strictEqual(players.find((p) => p.id === ids[0])!.enabled, 1);

      await userService.archiveAll();

      const archived = await userService.getArchived() as unknown as ArchivedRow[];
      assert.strictEqual(archived.length, 4);
      assert.deepStrictEqual(await userService.getAll(), []);
    });
  });

  describe("actualize", () => {
    it("должен восстановить игроков с изменением рейтинга за месяц", async () => {
      const { ids } = await seedFinishedMatch();
      await userService.archiveAll();

      assert.strictEqual((await userService.getArchived() as unknown as ArchivedRow[]).length, 4);

      await userService.actualize();

      const archived = await userService.getArchived() as unknown as ArchivedRow[];
      const players = await userService.getAll() as unknown as PlayerRow[];
      assert.deepStrictEqual<number[]>(archived.map((a) => a.id), []);
      assert.deepStrictEqual<number[]>(players.map((p) => p.id).sort((a, b) => a - b), ids);
      assert.ok(players.every((p) => p.enabled === 1));
    });
  });

  describe("getRating, setRating", () => {
    it("должен вернуть исходный рейтинг после установки", async () => {
      const id = await mkUser(1, 500);

      assert.deepStrictEqual(await userService.getRating(id), { rating: 500 });
    });

    it("должен вернуть рейтинг с дельтой после завершения матча", async () => {
      const { ids } = await seedFinishedMatch();

      assert.deepStrictEqual(await userService.getRating(ids[0]), { rating: 490 });
      assert.deepStrictEqual(await userService.getRating(ids[2]), { rating: 510 });
    });

    it("должен установить новый рейтинг", async () => {
      const id = await mkUser(1, 500);
      await userService.setRating(id, 600);

      assert.deepStrictEqual(await userService.getRating(id), { rating: 600 });
    });
  });

  describe("getDaysUntilBirthday", () => {
    it("должен вернуть количество дней до дня рождения в допустимом диапазоне", async () => {
      const id = await mkUser(1, 500);

      const result = await userService.getDaysUntilBirthday(id) as { days: number };
      assert.ok(result.days >= 0 && result.days <= 366);
    });
  });

  describe("getMatchesCount, getGamesCount", () => {
    it("должен вернуть количество матчей и игр игрока", async () => {
      const { ids } = await seedFinishedMatch();

      assert.deepStrictEqual(await userService.getMatchesCount(ids[0]), { count: 1 });
      assert.deepStrictEqual(await userService.getGamesCount(ids[0]), { count: 2 });
    });

    it("должен вернуть нули для игрока без матчей", async () => {
      const id = await mkUser(1, 500);

      assert.deepStrictEqual(await userService.getMatchesCount(id), { count: 0 });
      assert.deepStrictEqual(await userService.getGamesCount(id), { count: 0 });
    });

    it("должен считать матчи и игры только указанного турнира (#57)", async () => {
      const { ids } = await seedFinishedMatch();
      const tid = (await db.get<{ id: number }>(`SELECT id FROM tournament WHERE current = 1`))!.id;

      assert.deepStrictEqual(await userService.getMatchesCount(ids[0], tid), { count: 1 });
      assert.deepStrictEqual(await userService.getGamesCount(ids[0], tid), { count: 2 });
      // чужой турнир — нули; без турнира — за всё время
      assert.deepStrictEqual(await userService.getMatchesCount(ids[0], tid + 100000), { count: 0 });
      assert.deepStrictEqual(await userService.getGamesCount(ids[0], tid + 100000), { count: 0 });
      assert.deepStrictEqual(await userService.getMatchesCount(ids[0]), { count: 1 });
    });
  });

  describe("getCoWinnersById, getCoLosersById, getBuddiesById", () => {
    // матч A: пара 1 (ids 0,1) выиграла; матч B: пара 1 проиграла;
    // со-победители/со-проигравшие — только напарники, соперники не учитываются
    const seedTwoMatches = async () => {
      const ids = await seedUsers([500, 500, 500, 500, 500, 500]);
      // матч A: выигрывает пара 1
      await matchService.create(ids[0], ids[1], ids[2], ids[3]);
      const matchA = (await matchService.getAll() as { id: number }[])[0];
      await gameService.create(matchA.id, null, "15", "2026-01-01 10:00:00");
      await gameService.create(matchA.id, null, "17", "2026-01-01 10:05:00");
      // матч B: пара 1 проигрывает
      await matchService.create(ids[0], ids[1], ids[4], ids[5]);
      const matches = await matchService.getAll() as { id: number; finished: number }[];
      const matchB = matches.find((m) => m.id !== matchA.id && m.finished === 0)!;
      await gameService.create(matchB.id, "15", null, "2026-01-01 11:00:00");
      await gameService.create(matchB.id, "17", null, "2026-01-01 11:05:00");
      return ids;
    };

    it("должен вернуть напарника как со-победителя", async () => {
      const ids = await seedTwoMatches();

      assert.deepStrictEqual<CoPlayerRow[]>(await userService.getCoWinnersById(ids[0]), [{
        user_id: ids[1],
        win_count: 1,
        user_name: "Фамилия2 Имя2",
        user_sex: 1,
        user_pic: null,
      }]);
    });

    it("должен вернуть напарника как со-проигравшего", async () => {
      const ids = await seedTwoMatches();

      assert.deepStrictEqual<CoPlayerRow[]>(await userService.getCoLosersById(ids[0]), [{
        user_id: ids[1],
        lose_count: 1,
        user_name: "Фамилия2 Имя2",
        user_sex: 1,
        user_pic: null,
      }]);
    });

    it("должен вернуть напарника с винрейтом 50%", async () => {
      const ids = await seedTwoMatches();

      assert.deepStrictEqual<BuddyRow[]>(await userService.getBuddiesById(ids[0]), [{
        user_id: ids[1],
        user_name: "Фамилия2 Имя2",
        user_sex: 1,
        user_pic: null,
        win_rate: "50.00",
      }]);
    });

    it("должен вернуть напарника с нулевым винрейтом", async () => {
      const ids = await seedUsers([500, 500, 500, 500, 500, 500]);
      // два совместных поражения пары 1 (ids 0,1) — ни одной победы
      for (const hour of ["10", "11"]) {
        await matchService.create(ids[0], ids[1], ids[2], ids[3]);
        const matches = await matchService.getAll() as { id: number; finished: number }[];
        const match = matches.filter((m) => m.finished === 0).at(-1)!;
        await gameService.create(match.id, "15", null, `2026-01-01 ${hour}:00:00`);
        await gameService.create(match.id, "17", null, `2026-01-01 ${hour}:05:00`);
      }

      assert.deepStrictEqual<CoPlayerRow[]>(await userService.getCoWinnersById(ids[0]), []);
      assert.deepStrictEqual<BuddyRow[]>(await userService.getBuddiesById(ids[0]), [{
        user_id: ids[1],
        user_name: "Фамилия2 Имя2",
        user_sex: 1,
        user_pic: null,
        win_rate: "0.00",
      }]);
    });

    it("не должен учитывать незавершённые матчи", async () => {
      const ids = await seedUsers([500, 500, 500, 500, 500, 500]);
      // пара 1 (ids 0,1) проиграла одну игру — матч ещё не доигран (wins = 2)
      await matchService.create(ids[0], ids[1], ids[2], ids[3]);
      const matches = await matchService.getAll() as { id: number; finished: number }[];
      const match = matches.filter((m) => m.finished === 0).at(-1)!;
      await gameService.create(match.id, "15", null, "2026-01-01 10:00:00");

      assert.deepStrictEqual<BuddyRow[]>(await userService.getBuddiesById(ids[0]), []);
    });

    it("должен ограничивать статистику турниром (scope.tournamentId) (#57)", async () => {
      const ids = await seedTwoMatches();
      const tid = (await db.get<{ id: number }>(`SELECT id FROM tournament WHERE current = 1`))!.id;

      // в этом турнире — как без scope; в чужом турнире — пусто
      assert.deepStrictEqual<CoPlayerRow[]>(await userService.getCoWinnersById(ids[0], { tournamentId: tid }), [{
        user_id: ids[1],
        win_count: 1,
        user_name: "Фамилия2 Имя2",
        user_sex: 1,
        user_pic: null,
      }]);
      assert.deepStrictEqual(await userService.getCoWinnersById(ids[0], { tournamentId: tid + 100000 }), []);
    });

    it("должен ограничивать статистику типом турнира (scope.typeId) (#57)", async () => {
      const ids = await seedTwoMatches();
      const current = (await db.get<{ id: number; tournament_type_id: number }>(
        `SELECT id, tournament_type_id FROM tournament WHERE current = 1`,
      ))!;
      // турнир другого типа — становится текущим
      const other = (await tournamentService.create(
        1, 1, 1, current.tournament_type_id === 1 ? 2 : 1, "Другой тип",
        "2026-01-01 10:00:00", "2026-01-02 10:00:00", "2027-01-03 10:00:00",
        25, 1, "200", "600", "", 1,
      ))!;

      // по типу исходного турнира напарники находятся, по типу нового — нет
      assert.deepStrictEqual<CoPlayerRow[]>(await userService.getCoWinnersById(ids[0], { typeId: current.tournament_type_id }), [{
        user_id: ids[1],
        win_count: 1,
        user_name: "Фамилия2 Имя2",
        user_sex: 1,
        user_pic: null,
      }]);
      assert.deepStrictEqual(await userService.getCoWinnersById(ids[0], { tournamentId: other }), []);
      assert.deepStrictEqual(await userService.getCoLosersById(ids[0], { typeId: other }), []);
    });
  });

  describe("getWorstOpponentsById", () => {
    // создаёт матч: пара 1 (u1,u2) против пары 2 (u3,u4); firstPairWins —
    // выигрывает ли пара 1; games = 1 оставляет матч незавершённым
    const playMatch = async (
      four: number[],
      firstPairWins: boolean,
      date: string,
      games = 2,
    ): Promise<void> => {
      await matchService.create(four[0], four[1], four[2], four[3]);
      const matches = await matchService.getAll() as { id: number; finished: number }[];
      const match = matches.filter((m) => m.finished === 0).at(-1)!;
      for (let i = 0; i < games; i++) {
        await gameService.create(match.id, firstPairWins ? null : "15", firstPairWins ? "15" : null, `${date} 10:0${i}:00`);
      }
    };

    it("должен вернуть соперников с долей поражений больше 50% по убыванию", async () => {
      const ids = await seedUsers([500, 500, 500, 500, 500, 500, 500, 500]);
      // против ids[2]: 2 поражения из 2 доигранных (100%)
      await playMatch([ids[0], ids[1], ids[2], ids[3]], false, "2026-01-01");
      await playMatch([ids[0], ids[1], ids[2], ids[3]], false, "2026-01-02");
      // против ids[4]: поражение + незавершённый матч — учитывается только
      // доигранный (100%)
      await playMatch([ids[0], ids[1], ids[4], ids[5]], false, "2026-01-03");
      await playMatch([ids[0], ids[1], ids[4], ids[5]], false, "2026-01-04", 1);
      // против ids[6]: победа и поражение — ровно 50%, не попадает
      await playMatch([ids[0], ids[1], ids[6], ids[7]], true, "2026-01-05");
      await playMatch([ids[0], ids[1], ids[6], ids[7]], false, "2026-01-06");

      assert.deepStrictEqual<WorstOpponentRow[]>(await userService.getWorstOpponentsById(ids[0]), [
        {user_id: ids[2], user_name: "Фамилия3 Имя3", user_sex: 1, user_pic: null, lose_rate: "100.00"},
        {user_id: ids[3], user_name: "Фамилия4 Имя4", user_sex: 1, user_pic: null, lose_rate: "100.00"},
        {user_id: ids[4], user_name: "Фамилия5 Имя5", user_sex: 1, user_pic: null, lose_rate: "100.00"},
        {user_id: ids[5], user_name: "Фамилия6 Имя6", user_sex: 1, user_pic: null, lose_rate: "100.00"},
      ]);
    });

    it("должен отсортировать соперников по убыванию доли поражений", async () => {
      const ids = await seedUsers([500, 500, 500, 500, 500, 500, 500, 500]);
      // против ids[4]: 2 поражения из 3 доигранных (66.67%)
      await playMatch([ids[0], ids[1], ids[4], ids[5]], false, "2026-01-01");
      await playMatch([ids[0], ids[1], ids[4], ids[5]], false, "2026-01-02");
      await playMatch([ids[0], ids[1], ids[4], ids[5]], true, "2026-01-03");
      // против ids[2]: 2 поражения из 2 (100%) — выше в списке
      await playMatch([ids[0], ids[1], ids[2], ids[3]], false, "2026-01-04");
      await playMatch([ids[0], ids[1], ids[2], ids[3]], false, "2026-01-05");

      assert.deepStrictEqual<WorstOpponentRow[]>(await userService.getWorstOpponentsById(ids[0]), [
        {user_id: ids[2], user_name: "Фамилия3 Имя3", user_sex: 1, user_pic: null, lose_rate: "100.00"},
        {user_id: ids[3], user_name: "Фамилия4 Имя4", user_sex: 1, user_pic: null, lose_rate: "100.00"},
        {user_id: ids[4], user_name: "Фамилия5 Имя5", user_sex: 1, user_pic: null, lose_rate: "66.67"},
        {user_id: ids[5], user_name: "Фамилия6 Имя6", user_sex: 1, user_pic: null, lose_rate: "66.67"},
      ]);
    });
  });

  describe("setLabInfo", () => {
    it("должен сохранить данные с внешнего сайта", async () => {
      const id = await mkUser(1, 500);
      await userRepository.setLabInfo(id, 12345, "login", "Иванов Иван", "500", "520", "pic/1.jpg", "Доброград", "Клуб", "1990");

      const user = await userService.getById(id) as UserRow;
      assert.strictEqual(user.site_id, 12345);
      assert.strictEqual(user.site_login, "login");
      assert.strictEqual(user.club, "Клуб");
    });

    it("должен обновить данные при повторном сохранении", async () => {
      const id = await mkUser(1, 500);
      await userRepository.setLabInfo(id, 12345, "login", "Иванов Иван", "500", "520", "", "", "", "");
      await userRepository.setLabInfo(id, 12345, "login2", "Иванов Иван", "510", "530", "pic/2.jpg", "Москва", "Клуб2", "1991");

      const user = await userService.getById(id) as UserRow;
      assert.strictEqual(user.site_login, "login2");
      assert.strictEqual(user.club, "Клуб2");
    });
  });

  describe("setPassword", () => {
    it("должен сохранить хеш пароля и соль", async () => {
      const id = await mkUser(1, 500);
      await userRepository.setPassword(id, "secret");

      const row = await db.get<{ hashed_password: Buffer; salt: Buffer }>(
        "SELECT hashed_password, salt FROM user WHERE id = ?",
        [id],
      );
      assert.ok(row!.hashed_password.length === 32);
      assert.ok(row!.salt.length === 16);
    });
  });

  describe("labSearch", () => {
    it("должен распарсить единственный ответ сайта", async () => {
      mockFetch(siteRow());

      const player = await userService.labSearch("Иванов", "Доброград", 7) as LabPlayer;
      assert.deepStrictEqual<LabPlayer>(player, {
        user_id: 7,
        id: 12345,
        img: "data:image/webp;base64,AQIDBA==",
        r1: 500,
        r2: 520,
        name: "Иванов Иван",
        login: "login",
        club: "Клуб",
        city: "Доброград",
        year: 1990,
      });
    });

    it("должен вернуть undefined когда пользователь не найден", async () => {
      mockFetch(noRows);

      assert.strictEqual(await userService.labSearch("Иванов", null, 7), undefined);
    });

    it("должен вернуть undefined без ошибки когда сайт недоступен (fetch failed)", async () => {
      // сайт забанил IP: соединение отбивается на уровне TCP, fetch бросает TypeError
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch;

      try {
        assert.strictEqual(await userService.labSearch("Иванов", null, 7), undefined);
      } finally {
        globalThis.fetch = realFetch;
      }
    });

    it("должен повторить поиск по фамилии и имени когда полное ФИО не найдено", async () => {
      mockFetch(noRows, playerPage(), {"Иванов Иван": siteRow()});

      const player = await userService.labSearch("Иванов Иван Отчество", null, 7) as LabPlayer;
      assert.strictEqual(player.id, 12345);
    });

    it("должен собрать данные напрямую со страницы игрока когда известна привязка к id", async () => {
      mockFetch(siteRow(), playerPage({ id: "99999", login: "ivanov" }));

      const player = await userService.labSearch("Иванов", "Доброград", 7, 99999) as LabPlayer;
      assert.deepStrictEqual(fetchedUrls, [
        "https://badminton4u.ru/players/99999",
        // аватар скачивается следом за страницей игрока (с cache-buster'ом сайта)
        "https://badminton4u.ru/badm/users/12345/mini-avatar.webp?1788129740",
      ]);
      assert.strictEqual(player.id, 99999);
      assert.strictEqual(player.login, "ivanov");
    });

    it("должен вернуть img null когда аватар недоступен", async () => {
      mockFetch(siteRow(), playerPage(), {}, null);

      const player = await userService.labSearch("Иванов", "Доброград", 7) as LabPlayer;
      assert.strictEqual(player.img, null);
    });

    it("должен вернуть undefined когда пользователь не уникальный", async () => {
      mockFetch(siteRow() + siteRow({ id: "99999" }));

      assert.strictEqual(await userService.labSearch("Иванов", null, 7), undefined);
    });

    it("должен оставить единственного подходящего при фильтре по городу", async () => {
      mockFetch(
        siteRow() +
        siteRow({ id: "99999", name: "Петров Пётр", city: "г. Москва" }),
      );

      const player = await userService.labSearch("Иванов", "Доброград", 7) as LabPlayer;
      assert.strictEqual(player.id, 12345);
    });

    it("должен вернуть undefined когда по городу совпадают несколько", async () => {
      mockFetch(siteRow() + siteRow({ id: "99999" }));

      assert.strictEqual(await userService.labSearch("Иванов", "Доброград", 7), undefined);
    });
  });

  describe("labCrawl", () => {
    it("должен сохранить найденные данные по всем игрокам", async () => {
      await new SettingsService().set("crawl_min_ms", "0");
      await new SettingsService().set("crawl_max_ms", "0");
      mockFetch(siteRow());
      const ids = await seedUsers();

      await userService.labCrawl();

      for (const id of ids) {
        const user = await userService.getById(id) as UserRow;
        assert.strictEqual(user.site_id, 12345);
        assert.strictEqual(user.site_login, "login");
        assert.strictEqual(user.club, "Клуб");
      }
    });

    it("должен использовать сохранённую привязку к id без поиска по имени", async () => {
      await new SettingsService().set("crawl_min_ms", "0");
      await new SettingsService().set("crawl_max_ms", "0");
      mockFetch(noRows, playerPage({ id: "99999", login: "ivanov" }));
      const ids = await seedUsers([500]);
      await db.run(
        "INSERT INTO user_lab (user_id, site_id, rating_2) VALUES (?, 99999, 0)",
        [ids[0]],
      );

      await userService.labCrawl();

      assert.strictEqual(fetchedUrls.filter(url => url.includes("/ajax?search=rating")).length, 0);
      assert.ok(fetchedUrls.includes("https://badminton4u.ru/players/99999"));
      const user = await userService.getById(ids[0]) as UserRow;
      assert.strictEqual(user.site_id, 99999);
      assert.strictEqual(user.site_login, "ivanov");
    });

    it("должен пропускать игроков, обновлённых в пределах crawl_cache_m минут", async () => {
      const settings = new SettingsService();
      await settings.set("crawl_min_ms", "0");
      await settings.set("crawl_max_ms", "0");
      mockFetch(siteRow());
      await seedUsers();

      await userService.labCrawl();
      assert.ok(fetchedUrls.filter(url => url.includes("/ajax?search=rating")).length > 0);

      // второй прогон сразу после первого — кеш свеж, запросов к сайту нет
      fetchedUrls.length = 0;
      await userService.labCrawl();
      assert.strictEqual(fetchedUrls.length, 0);
    });

    it("должен обходить игрока, обновлённого раньше crawl_cache_m минут назад", async () => {
      const settings = new SettingsService();
      await settings.set("crawl_min_ms", "0");
      await settings.set("crawl_max_ms", "0");
      mockFetch(siteRow());
      const [id] = await seedUsers();

      await userService.labCrawl();
      await db.run("UPDATE user_lab SET crawled_at = datetime('now', '-31 minutes')");
      fetchedUrls.length = 0;

      await userService.labCrawl();
      // у игрока есть привязка site_id — запрос идёт напрямую на страницу игрока
      assert.ok(fetchedUrls.filter(url => url.includes("badminton4u.ru/players/")).length > 0);
      const row = await db.get<{ crawled_at: string }>("SELECT crawled_at FROM user_lab WHERE user_id = ?", [id]);
      // после обхода время обновления свежее
      assert.ok(row!.crawled_at > new Date(Date.now() - 60_000).toISOString().replace('T', ' ').slice(0, 19));
    });

    it("должен брать паузу между запросами из crawl_min_ms и crawl_max_ms", async () => {
      const settings = new SettingsService();
      await settings.set("crawl_min_ms", "0");
      await settings.set("crawl_max_ms", "0");
      mockFetch(siteRow());
      const started = Date.now();
      await seedUsers();

      await userService.labCrawl();

      // паузы из настроек = 0 мс: 4 игрока × 2 запроса без ожиданий
      assert.ok(Date.now() - started < 2000, `краул занял ${Date.now() - started} мс — паузы не из настроек`);
    });

    it("должен выдерживать паузу из настроек перед запросом страницы отдельного игрока", async () => {
      // дефолтные настройки 500..3000 мс; игрок с известной привязкой site_id —
      // два запроса (страница + аватар), перед каждым пауза ≥ crawl_min_ms
      mockFetch(noRows, playerPage({ id: "99999", login: "ivanov" }));
      const ids = await seedUsers([500]);
      await db.run(
        "INSERT INTO user_lab (user_id, site_id, rating_2) VALUES (?, 99999, 0)",
        [ids[0]],
      );

      const started = Date.now();
      await userService.labCrawl();

      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 950, `labSearch занял ${elapsed} мс — пауза перед запросом страницы игрока не выдерживается`);
    });

    it("должен завершиться без ошибки и отметить время обхода когда сайт недоступен (fetch failed)", async () => {
      await new SettingsService().set("crawl_min_ms", "0");
      await new SettingsService().set("crawl_max_ms", "0");
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch;

      try {
        const ids = await seedUsers();

        await userService.labCrawl();

        // попытки отмечаются — недоступный сайт не долбится при каждой загрузке страницы
        const row = await db.get<{ crawled_at: string | null }>(
          "SELECT crawled_at FROM user_lab WHERE user_id = ?", [ids[0]]);
        assert.ok(row!.crawled_at);
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });
});
