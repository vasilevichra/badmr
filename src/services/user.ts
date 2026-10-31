import UserRepository from '../repositories/user.ts';
import SettingsService from './settings.ts';
import { JSDOM } from 'jsdom';
import Bluebird from 'bluebird';

const settingsService = new SettingsService();

interface BuddyStatRow {
  user_id: number;
  user_name: string;
  user_sex: number | null;
  user_pic: string | null;
  win_count: number;
  lose_count: number;
  win_rate: number;
}

interface WorstOpponentStatRow {
  user_id: number;
  user_name: string;
  user_sex: number | null;
  user_pic: string | null;
  lose_rate: number;
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

/** Результат поиска для формы регистрации: фронту нужно различать
 * недоступный сайт (blocked), неуникальный поиск (matches > 1) и
 * единственного найденного игрока (player). */
interface LabSearchResult {
  /** ok — сайт ответил; blocked — недоступен (бан IP, таймаут). */
  status: 'ok' | 'blocked';
  /** Сколько игроков нашлось после фильтра по городу. */
  matches: number;
  /** Данные единственного найденного игрока — только при matches === 1. */
  player?: LabPlayer;
}

// строка Cookie для запросов к badminton4u.ru берётся из переменной
// окружения BADM4U_COOKIE (файл .env). Если сайт перестанет отвечать
// данными — обнови куку: DevTools (F12) → Network → любой запрос →
// заголовок Cookie
const siteCookie = (): string | null => {
  return process.env.BADM4U_COOKIE?.trim() || null;
};

// заголовки — как у браузера, чтобы запросы не отличались от настоящих
const siteHeaders = (): Record<string, string> => {
  const cookie = siteCookie();
  return {
    'Accept': '*/*',
    'Accept-Language': 'ru',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    ...(cookie ? {'Cookie': cookie} : {}),
    'Origin': 'https://badminton4u.ru',
    'Pragma': 'no-cache',
    'Referer': 'https://badminton4u.ru/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15',
  };
};

class User {
  declare static _instance: User | undefined;
  user!: UserRepository;

  constructor() {
    if (User._instance) {
      return User._instance;
    }
    User._instance = this;

    this.user = new UserRepository();
  }

  create = (lastname: string, firstname: string, patronymic: string, rating: number, sex: number, city_id: number, birthday: string) => this.user.create(lastname, firstname, patronymic, rating, sex, city_id, birthday);
  getAll = (tournamentId?: number) => this.user.getAll(tournamentId);
  select = (city_id: number) => this.user.select(city_id);
  getArchived = (tournamentId?: number) => this.user.getArchived(tournamentId);
  getById = (id: number) => this.user.getById(id);
  /** Поиск при регистрации.
   *
   *  city_id — город проведения турнира:
   *  - отчество не введено и найдено несколько вариантов → оставляем
   *    совпадающих по городу (если такие есть);
   *  - отчество введено, но точных совпадений нет → ищем по фамилии,
   *    имени и городу (отчество отбрасываем). */
  findBy = async (lastname: string, firstname: string, patronymic: string, city_id?: number) => {
    if (patronymic) {
      const exact = await this.user.findBy(lastname, firstname, patronymic);
      if (exact.length > 0 || !city_id) {
        return exact;
      }
      return this.user.findBy(lastname, firstname, '', city_id);
    }

    const found = await this.user.findBy(lastname, firstname, '');
    if (found.length > 1 && city_id) {
      const inCity = await this.user.findBy(lastname, firstname, '', city_id);
      if (inCity.length > 0) {
        return inCity;
      }
    }
    return found;
  };
  registerAll = () => this.user.registerAll();
  enable = (ids: number[]) => this.user.enable(ids);
  disable = (ids: number[]) => this.user.disable(ids);
  registerByIds = (ids: number[]) => this.user.registerByIds(ids);
  deregisterAll = () => this.user.deregisterAll();
  deregisterByIds = (ids: number[]) => this.user.deregisterByIds(ids);
  isRegistered = (id: number) => this.user.isRegistered(id);
  actualize = () => this.user.actualize();
  archive = (id: number) => this.user.archive(id);
  archiveAll = () => this.user.archiveAll();
  unarchive = (id: number) => this.user.unarchive(id);
  unarchiveAll = () => this.user.unarchiveAll();
  getRating = (id: number) => this.user.getRating(id);
  getCalibration = (id: number) => this.user.getCalibration(id);
  setRating = (id: number, rating: number) => this.user.setRating(id, rating);
  getDaysUntilBirthday = (id: number) => this.user.getDaysUntilBirthday(id);
  getMatchesCount = (id: number, tournamentId?: number) => this.user.getMatchesCount(id, tournamentId);
  getGamesCount = (id: number, tournamentId?: number) => this.user.getGamesCount(id, tournamentId);
  /**
   * Возвращает напарников пользователя, с которыми он выигрывал матчи
   * (соперники не учитываются). Напарники отсортированы по убыванию
   * числа совместных побед.
   * @param id Id пользователя.
   * @param scope Ограничение области: `tournamentId` — матчи одного
   *              турнира, `typeId` — матчи турниров одного типа;
   *              без scope — все матчи.
   * @returns Список напарников: id, имя, пол, аватар, число совместных побед.
   */
  getCoWinnersById = (id: number, scope?: { tournamentId?: number; typeId?: number }) => (this.user.getCoWinnersById(id, scope) as BuddyStatRow[]).map(w => ({
    user_id: w.user_id,
    win_count: w.win_count,
    user_name: w.user_name,
    user_sex: w.user_sex,
    user_pic: w.user_pic,
  }));

  /**
   * Возвращает напарников пользователя, с которыми он проигрывал матчи
   * (соперники не учитываются). Напарники отсортированы по убыванию
   * числа совместных поражений.
   * @param id Id пользователя.
   * @param scope Ограничение области — см. {@link getCoWinnersById}.
   * @returns Список напарников: id, имя, пол, аватар, число совместных поражений.
   */
  getCoLosersById = (id: number, scope?: { tournamentId?: number; typeId?: number }) => (this.user.getCoLosersById(id, scope) as BuddyStatRow[]).map(l => ({
    user_id: l.user_id,
    lose_count: l.lose_count,
    user_name: l.user_name,
    user_sex: l.user_sex,
    user_pic: l.user_pic,
  }));

  /**
   * Собирает статистику по напарникам пользователя («напарники» на странице
   * игрока): винрейт — долю совместных побед в паре в процентах с двумя
   * знаками после запятой (строка).
   *
   * В список попадают все напарники, включая тех, с кем не было ни одной
   * совместной победы (винрейт «0.00»). Сортировка — по убыванию винрейта.
   * @param id Id пользователя.
   * @returns Список напарников: id, имя, пол, аватар, винрейт в процентах.
   */
  getBuddiesById = (id: number) => (this.user.getBuddiesById(id) as BuddyStatRow[]).map(b => ({
    user_id: b.user_id,
    user_name: b.user_name,
    user_sex: b.user_sex,
    user_pic: b.user_pic,
    win_rate: b.win_rate.toFixed(2),
  }));

  /**
   * Возвращает соперников, против которых пользователь проигрывает чаще,
   * чем выигрывает (доля поражений строго больше 50% в доигранных
   * матчах), отсортированные по убыванию доли поражений.
   * @param id Id пользователя.
   * @returns Список соперников: id, имя, пол, аватар, доля поражений
   *          в процентах — начиная с самых неудобных.
   */
  getWorstOpponentsById = (id: number) => (this.user.getWorstOpponentsById(id) as WorstOpponentStatRow[]).map(o => ({
    user_id: o.user_id,
    user_name: o.user_name,
    user_sex: o.user_sex,
    user_pic: o.user_pic,
    lose_rate: o.lose_rate.toFixed(2),
  }));

  /**
   * Ищет игрока на badminton4u.ru и собирает его данные: одиночный (r1) и
   * парный (r2) рейтинги, логин, клуб, город, год рождения и аватар.
   *
   * Сайт стал SPA и ищет игроков запросом POST /ajax?search=rating&s=d
   * с urlencoded-полем title; по полному ФИО с отчеством он больше не
   * находит, поэтому при пустом результате поиск повторяется по
   * «Фамилия Имя». Полные данные берутся со страницы игрока
   * (POST /players/<id> c only=main).
   *
   * Если привязка к профилю сайта уже известна (site_id из user_lab),
   * поиск пропускается и данные собираются напрямую со страницы игрока.
   * @param name Имя игрока в приложении («Фамилия Имя Отчество»).
   * @param city Город для уточнения неуникальных совпадений.
   * @param user_id Id пользователя в приложении.
   * @param site_id Привязка к профилю badminton4u.ru, если известна.
   * @returns Результат поиска: status blocked, если сайт недоступен; иначе
   *          число совпадений и данные игрока, когда совпадение единственное.
   */
  async labSearch(name: string, city: string | null, user_id: number, site_id: number | null = null): Promise<LabSearchResult> {
    // недоступный сайт (бан IP, таймаут, сброс соединения) — не ошибка для
    // вызывающих: считаем сайт заблокированным, а время попытки
    // отмечается в labCrawl, чтобы не долбить сайт при каждой загрузке
    try {
      return await this.searchLab(name, city, user_id, site_id);
    } catch {
      return {status: 'blocked', matches: 0};
    }
  }

  private async searchLab(name: string, city: string | null, user_id: number, site_id: number | null = null): Promise<LabSearchResult> {
    // пауза перед каждым запросом, чтобы не походить на бота:
    // случайное значение между crawl_min_ms и crawl_max_ms (настройки)
    const pause = (base = 0) => {
      const min = Number(settingsService.get('crawl_min_ms'));
      const max = Number(settingsService.get('crawl_max_ms'));
      return Bluebird.delay(Math.random() * (max - min) + min + base);
    };
    // сайт иногда сбрасывает соединение (ECONNRESET) — повторяем попытки
    const retry = async <T>(request: () => Promise<T>): Promise<T> => {
      for (let attempt = 1; ; attempt++) {
        await pause(1000 * (attempt - 1));
        try {
          return await request();
        } catch (error) {
          if (attempt >= 3) {
            throw error;
          }
        }
      }
    };
    const fetchHtml = async (url: string, body: string): Promise<string> =>
        retry(async () => {
          const response = await fetch(url, {method: 'POST', headers: siteHeaders(), body});
          return (await response.json() as {html: string}).html;
        });
    // бинарные ответы (аватар) — та же пауза и повторы; не-2xx означает «аватара нет»
    const fetchBytes = async (url: string): Promise<Uint8Array | null> =>
        retry(async () => {
          const response = await fetch(url, {method: 'GET', headers: siteHeaders()});
          if (!response.ok) {
            return null;
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          return bytes.length > 0 ? bytes : null;
        });

    // прямая выборка по известной привязке — совпадение всегда одно
    let id = site_id;
    let matches = 1;
    if (!id) {
      interface SitePlayer {
        id: number;
        city: string | null;
      }
      const searchRows = async (title: string): Promise<SitePlayer[]> => {
        const document = new JSDOM(await fetchHtml('https://badminton4u.ru/ajax?search=rating&s=d', `title=${encodeURIComponent(title)}&s=d`)).window.document;
        const rows = [...document.querySelectorAll('a[href*="/players/"]')].map(row => {
          const href = row.getAttribute('href') ?? '';
          return {
            id: Number((href.match(/(\d+)/) ?? [])[1]),
            city: [...row.querySelectorAll('span')].map(span => span.textContent ?? '').find(text => text.startsWith('г. ')) ?? null,
          };
        });
        // нормальный пустой ответ содержит маркер «ничего не найдено»;
        // HTML без ссылок и без маркера — страница блокировки (WAF, бан):
        // отдаём наверх как сетевую ошибку, а не «совпадений нет»
        if (rows.length === 0 && !document.querySelector('.no-found')) {
          throw new Error('badminton4u: ответ поиска без результатов и без маркера «не найдено» — блокировка?');
        }
        return rows;
      };

      let players = await searchRows(name);
      if (players.length === 0) {
        const words = name.trim().split(/\s+/);
        if (words.length >= 3) {
          players = await searchRows(words.slice(0, 2).join(' '));
        }
      }
      const site_users = city ? players.filter(player => player.city?.includes(`г. ${city}`)) : players;
      matches = site_users.length;
      if (site_users.length !== 1) {
        return {status: 'ok', matches: site_users.length};
      }
      id = site_users[0].id;
    }

    // страница игрока: оба рейтинга, логин, клуб, город, год рождения, аватар
    const document = new JSDOM(await fetchHtml(`https://badminton4u.ru/players/${id}`, 'only=main&theme=light')).window.document;
    // страница игрока всегда содержит секцию #info (адрес, дата рождения);
    // ответ без неё — заглушка блокировки: считаем сайт недоступным,
    // а не «игрок найден»
    if (!document.querySelector('#info')) {
      throw new Error(`badminton4u: страница игрока ${id} без данных — блокировка?`);
    }
    const dfn = (type: string) => document.querySelector(`dfn[data-type="${type}"]`);
    const avatarUrl = (document.querySelector('header bdo[style]')?.getAttribute('style') ?? '')
      .match(/url\(['"]?([^'")]+)/)?.[1] ?? null;
    const year = (document.querySelector('#info .birth')?.textContent ?? '').match(/\d{4}/);

    // аватар скачивается и хранится в БД как data-URL (base64): хотлинк на
    // badminton4u.ru ненадёжен — сайт режет автоматические запросы и банит IP
    let img: string | null = null;
    if (avatarUrl) {
      const bytes = await fetchBytes('https://badminton4u.ru/' + avatarUrl.replace(/^\//, ''));
      if (bytes) {
        const ext = avatarUrl.replace(/\?.*$/, '').split('.').pop()?.toLowerCase();
        const mime = {webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif'}[ext ?? ''] ?? 'image/webp';
        img = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
      }
    }

    const player: LabPlayer = {
      user_id: user_id,
      id: id,
      img: img,
      r1: Number(dfn('s')?.textContent) || null,
      r2: Number(dfn('d')?.textContent) || null,
      name: (document.querySelector('h1')?.textContent ?? '').trim(),
      login: (document.querySelector('h2')?.textContent ?? '').replace(/^@/, '').trim() || null,
      club: document.querySelector('a[data-u="club"]')?.textContent?.trim() ?? null,
      city: (document.querySelector('#info .address')?.textContent ?? '').replace(/^г\. /, '').trim() || null,
      year: year ? Number(year[0]) : null,
    };
    return {status: 'ok', matches, player};
  }

  /** Фоновый запуск обхода: ответ роута не ждёт окончания обхода,
   *  повторные вызовы во время идущего обхода не создают параллельный. */
  labCrawlBackground = async (): Promise<void> => {
    if (this.crawling) {
      return;
    }
    this.crawling = true;
    try {
      await this.labCrawl();
    } catch (error) {
      // фоновая задача — некому отдать ошибку, только лог
      console.error('labCrawl:', error);
    } finally {
      this.crawling = false;
    }
  };

  crawling = false;

  labCrawl = async () => {
    // только участники текущего турнира и только с устаревшим кешем
    // (crawl_cache_m минут) — свежие данные уже в user_lab
    const users = await this.user.getLabCrawlUsers(Number(settingsService.get('crawl_cache_m')));
    const found: LabPlayer[] = [];
    for (const [index, user] of users.entries()) {
      try {
        const outcome = await this.searchLab(user.name, user.city, user.user_id, user.site_id);
        if (outcome.player) {
          found.push(outcome.player);
        }
      } catch {
        // сайт недоступен: остальные упали бы с той же сетевой ошибкой —
        // обход прекращается, попытка отмечается сразу у всех оставшихся,
        // иначе недоступный сайт долбился бы при каждой загрузке страницы
        for (const rest of users.slice(index)) {
          await this.user.touchLabCrawled(rest.user_id);
        }
        break;
      }
      // время обхода отмечается даже при пустом результате — иначе
      // ненайденный игрок запрашивался бы при каждой загрузке страницы
      await this.user.touchLabCrawled(user.user_id);
    }
    return Bluebird.all(found.map(p => this.user.setLabInfo(p.user_id, p.id, p.login ?? '', p.name, p.r1 === null ? '' : String(p.r1), p.r2 === null ? '' : String(p.r2), p.img ?? '', p.city ?? '', p.club ?? '', p.year === null ? '' : String(p.year))));
  };
}

export default User;
