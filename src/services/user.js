const UserRepository = require('../repositories/user');
const {JSDOM} = require('jsdom');
const Promise = require('bluebird');
const {response} = require("express");

class User {
  constructor() {
    if (User._instance) {
      return User._instance;
    }
    User._instance = this;

    this.user = new UserRepository();
  }

  create = (lastname, firstname, patronymic, sex, city_id, birthday) => this.user.create(lastname, firstname, patronymic, sex, city_id, birthday)
  getAll = () => this.user.getAll();
  select = (city_id) => this.user.select(city_id);
  getArchived = () => this.user.getArchived();
  getById = (id) => this.user.getById(id);
  registerAll = () => this.user.registerAll();
  registerByIds = (ids) => this.user.registerByIds(ids);
  deregisterAll = () => this.user.deregisterAll();
  deregisterByIds = (ids) => this.user.deregisterByIds(ids);
  actualize = () => this.user.actualize();
  archive = (id) => this.user.archive(id);
  archiveAll = () => this.user.archiveAll();
  unarchive = (id) => this.user.unarchive(id);
  unarchiveAll = () => this.user.unarchiveAll();
  getRating = (id) => this.user.getRating(id);
  setRating = (id, rating) => this.user.setRating(id, rating);
  labCrawl = () => {
    return this.getAll()
    // .then(users => users.slice(18, 19))
    .then(users =>
        Promise.map(users, user =>
                Promise.delay(Math.random() * (1000 - 500) + 500) // от 500мс до 1сек
                .then(() => fetch('https://badminton4u.ru/?ajax', {
                  method: 'POST',
                  headers: {
                    'Accept-Language': 'ru',
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'Cookie': 'PHPSESSID=qil4gj8imecdtqa7a88lf39mhb; region=77',
                    'Pragma': 'no-cache',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15',
                  },
                  body: `search=${user.name}`,
                }))
                .then(response => response.json())
                .then(response => {
                  if (response.length > 1) {
                    const site_users = response.filter(site_user => site_user.text.includes(`<i>г. ${user.city}`));
                    return site_users.length === 1 ? Promise.resolve(site_users[0]) : Promise.resolve({error: `Пользователь ${user.name} не уникальный`});
                  } else if (response.length === 0) {
                    return Promise.resolve({error: `Пользователь ${user.name} не зарегистрирован`});
                  } else {
                    return Promise.resolve(response[0]);
                  }
                })
                .then(player => {
                  if (!('error' in player)) {
                    const textDocument = new JSDOM(player.text).window.document;
                    const textSpan = textDocument.querySelector('span');
                    const textSpanA = textSpan ? textSpan.querySelector('a') : null;
                    const textI = textDocument.querySelector('i');
                    const textIContent = textI ? textI.textContent.split(', ') : null;
                    const title = new JSDOM(player.title).window.document.querySelector('u');
                    const rates = title.getElementsByTagName('dfn');
                    const img = new JSDOM(player.img).window.document.querySelector('img');
                    const matchTextCity = (content) => {
                      if (!content) {
                        return null;
                      }
                      if (content.length > 0 && /^\D/.test(content[0])) {
                        return content[0].replace(/^г\. /, '');
                      }
                      return null;
                    }
                    const matchTextYear = (content) => {
                      if (!content) {
                        return null;
                      }
                      if (content.length === 2 && /^\d/.test(content[1])) {
                        return Number(textIContent[1].replace(/\D.*/, ''));
                      }
                      if (content.length === 1 && /^\d/.test(content[0])) {
                        return Number(textIContent[0].replace(/\D.*/, ''));
                      }
                      return null;
                    }

                    return {
                      user_id: user.id,
                      id: Number(player.link.substring(8)),
                      img: img ? 'https://badminton4u.ru/' + img.getAttribute('src') : null,
                      r1: Number(rates[0].textContent) || null,
                      r2: Number(rates.length === 3 ? rates[2].textContent : rates[1].textContent),
                      name: title.textContent.match(/^\D+(?=\s)/)[0],
                      login: textSpan ? textSpan.textContent.split(' ')[0] : null,
                      club: textSpanA ? textSpanA.textContent : null,
                      city: matchTextCity(textIContent),
                      year: matchTextYear(textIContent),
                    }
                  }
                }),
            {concurrency: 3}
        )
    )
    .then(responses => Promise.all(responses))
    .then(responses => responses.filter(r => r))
    .then(players => players.forEach(p => this.user.setLabInfo(p.user_id, p.id, p.login, p.name, p.r1, p.r2, p.img, p.city, p.club, p.year)))
  };
}

module.exports = User;
