import UserRepository from '../repositories/user.ts';
import { JSDOM } from 'jsdom';
import Promise from 'bluebird';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

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

// строка Cookie для запросов к badminton4u.ru берётся из файла
// .data/badm4u-cookies.txt; если сайт перестанет отвечать данными —
// обнови файл: DevTools (F12) → Network → любой запрос → заголовок Cookie
const siteCookie = (): string | null => {
  try {
    return readFileSync(path.join(ROOT, '.data/badm4u-cookies.txt'), 'utf8').trim() || null;
  } catch {
    return null;
  }
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
  getAll = () => this.user.getAll();
  select = (city_id: number) => this.user.select(city_id);
  getArchived = () => this.user.getArchived();
  getById = (id: number) => this.user.getById(id);
  findBy = (lastname: string, firstname: string, patronymic: string) => this.user.findBy(lastname, firstname, patronymic);
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
  setRating = (id: number, rating: number) => this.user.setRating(id, rating);
  getDaysUntilBirthday = (id: number) => this.user.getDaysUntilBirthday(id);
  getMatchesCount = (id: number) => this.user.getMatchesCount(id);
  getGamesCount = (id: number) => this.user.getGamesCount(id);
  /**
   * Возвращает напарников пользователя, с которыми он выигрывал матчи
   * (соперники не учитываются). Напарники отсортированы по убыванию
   * числа совместных побед.
   * @param id Id пользователя.
   * @returns Список напарников: id, имя, пол, аватар, число совместных побед.
   */
  getCoWinnersById = (id: number) => (this.user.getCoWinnersById(id) as BuddyStatRow[]).map(w => ({
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
   * @returns Список напарников: id, имя, пол, аватар, число совместных поражений.
   */
  getCoLosersById = (id: number) => (this.user.getCoLosersById(id) as BuddyStatRow[]).map(l => ({
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
   * @returns Данные игрока либо undefined, если игрок не найден или не уникален.
   */
  async labSearch(name: string, city: string | null, user_id: number, site_id: number | null = null): Promise<LabPlayer | undefined> {
    // пауза перед каждым запросом, чтобы не походить на бота
    const pause = (base = 0) => Promise.delay(Math.random() * 1000 + 500 + base);
    // сайт иногда сбрасывает соединение (ECONNRESET) — повторяем попытки
    const fetchHtml = async (url: string, body: string): Promise<string> => {
      for (let attempt = 1; ; attempt++) {
        await pause(1000 * (attempt - 1));
        try {
          const response = await fetch(url, {method: 'POST', headers: siteHeaders(), body});
          return (await response.json() as {html: string}).html;
        } catch (error) {
          if (attempt >= 3) {
            throw error;
          }
        }
      }
    };

    let id = site_id;
    if (!id) {
      interface SitePlayer {
        id: number;
        city: string | null;
      }
      const searchRows = async (title: string): Promise<SitePlayer[]> => {
        const document = new JSDOM(await fetchHtml('https://badminton4u.ru/ajax?search=rating&s=d', `title=${encodeURIComponent(title)}&s=d`)).window.document;
        return [...document.querySelectorAll('a[href*="/players/"]')].map(row => {
          const href = row.getAttribute('href') ?? '';
          return {
            id: Number((href.match(/(\d+)/) ?? [])[1]),
            city: [...row.querySelectorAll('span')].map(span => span.textContent ?? '').find(text => text.startsWith('г. ')) ?? null,
          };
        });
      };

      let players = await searchRows(name);
      if (players.length === 0) {
        const words = name.trim().split(/\s+/);
        if (words.length >= 3) {
          players = await searchRows(words.slice(0, 2).join(' '));
        }
      }
      const site_users = city ? players.filter(player => player.city?.includes(`г. ${city}`)) : players;
      if (site_users.length !== 1) {
        return undefined;
      }
      id = site_users[0].id;
    }

    // страница игрока: оба рейтинга, логин, клуб, город, год рождения, аватар
    const document = new JSDOM(await fetchHtml(`https://badminton4u.ru/players/${id}`, 'only=main&theme=light')).window.document;
    const dfn = (type: string) => document.querySelector(`dfn[data-type="${type}"]`);
    const avatarUrl = (document.querySelector('header bdo[style]')?.getAttribute('style') ?? '')
      .match(/url\(['"]?([^'")]+)/)?.[1] ?? null;
    const year = (document.querySelector('#info .birth')?.textContent ?? '').match(/\d{4}/);

    return {
      user_id: user_id,
      id: id,
      img: avatarUrl ? 'https://badminton4u.ru/' + avatarUrl.replace(/^\//, '').replace(/\?.*$/, '') : null,
      r1: Number(dfn('s')?.textContent) || null,
      r2: Number(dfn('d')?.textContent) || null,
      name: (document.querySelector('h1')?.textContent ?? '').trim(),
      login: (document.querySelector('h2')?.textContent ?? '').replace(/^@/, '').trim() || null,
      club: document.querySelector('a[data-u="club"]')?.textContent?.trim() ?? null,
      city: (document.querySelector('#info .address')?.textContent ?? '').replace(/^г\. /, '').trim() || null,
      year: year ? Number(year[0]) : null,
    };
  }

  labCrawl = async () => {
    const users = this.getAll() as unknown as { id: number; name: string; city: string | null }[];
    const labSites = await this.user.getLabSites() as unknown as { user_id: number; site_id: number }[];
    const siteIds = new Map(labSites.map(row => [row.user_id, row.site_id]));
    const responses = await Promise.map(users, user => this.labSearch(user.name, user.city, user.id, siteIds.get(user.id) ?? null), {concurrency: 1});
    const players = responses.filter(r => r);
    return Promise.all(players.map(p => this.user.setLabInfo(p!.user_id, p!.id, p!.login ?? '', p!.name, p!.r1 === null ? '' : String(p!.r1), p!.r2 === null ? '' : String(p!.r2), p!.img ?? '', p!.city ?? '', p!.club ?? '', p!.year === null ? '' : String(p!.year))));
  };
}

export default User;
