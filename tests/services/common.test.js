const assert = require('node:assert');
const {test, describe, it, beforeEach} = require('node:test');

const DBMigrate = require("db-migrate");
const {faker} = require("@faker-js/faker");

const CommonService = require('../../src/services/common');
const CortService = require('../../src/services/court');
const UserService = require("../../src/services/user");

const migration = DBMigrate.getInstance(true, {
  config: "./database.json",
  env: "test"
});
migration.silence(true);

const clean = async () => {
  await migration.down(2)
  await migration.up(2)
}

const user_1 = {id: 1, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 500};
const user_2 = {id: 2, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 400};
const user_3 = {id: 3, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 300};
const user_4 = {id: 4, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 250};
const user_5 = {id: 5, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 600};
const user_6 = {id: 6, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 450};
const user_7 = {id: 7, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 320};
const user_8 = {id: 8, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 550};
const user_9 = {id: 9, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 150};
const user_10 = {id: 10, lastname: faker.person.lastName(), firstname: faker.person.firstName(), rating: 750};

describe('Common', () => {
  beforeEach(async () => {
    console.log = function () {
    };
    await clean();
  });

  describe('ready', () => {
    describe('должен находить пары', () => {
      [
        {
          title: "нет разницы в рейтинге",
          users: [user_2, user_3, user_8, user_9],
          courts: 1,
          pairs: [
            {
              players1: [
                {matches: 0, played: 0, name: `${user_2.lastname} ${user_2.firstname}`, rating: user_2.rating, user_id: 1},
                {matches: 0, played: 0, name: `${user_3.lastname} ${user_3.firstname}`, rating: user_3.rating, user_id: 2},
              ],
              players2: [
                {matches: 0, played: 0, name: `${user_8.lastname} ${user_8.firstname}`, rating: user_8.rating, user_id: 3},
                {matches: 0, played: 0, name: `${user_9.lastname} ${user_9.firstname}`, rating: user_9.rating, user_id: 4},
              ],
              diff: 0,
              matches: 0,
              played: 0,
            }
          ]
        },
        {
          title: "разница в рейтинге 50 (в допустимых границах)",
          users: [user_1, user_2, user_3, user_4],
          courts: 1,
          pairs: [
            {
              players1: [
                {matches: 0, played: 0, name: `${user_1.lastname} ${user_1.firstname}`, rating: user_1.rating, user_id: 1},
                {matches: 0, played: 0, name: `${user_4.lastname} ${user_4.firstname}`, rating: user_4.rating, user_id: 4},
              ],
              players2: [
                {matches: 0, played: 0, name: `${user_2.lastname} ${user_2.firstname}`, rating: user_2.rating, user_id: 2},
                {matches: 0, played: 0, name: `${user_3.lastname} ${user_3.firstname}`, rating: user_3.rating, user_id: 3},
              ],
              diff: 50,
              matches: 0,
              played: 0,
            }
          ]
        },
        {
          title: "лучший подбор",
          users: [user_1, user_2, user_3, user_4, user_5, user_6, user_7, user_8],
          courts: 1,
          pairs: [
            {
              players1: [
                {matches: 0, played: 0, name: `${user_1.lastname} ${user_1.firstname}`, user_id: 1, rating: user_1.rating,},
                {matches: 0, played: 0, name: `${user_2.lastname} ${user_2.firstname}`, user_id: 2, rating: user_2.rating,},
              ],
              players2: [
                {matches: 0, played: 0, name: `${user_3.lastname} ${user_3.firstname}`, user_id: 3, rating: user_3.rating,},
                {matches: 0, played: 0, name: `${user_5.lastname} ${user_5.firstname}`, user_id: 5, rating: user_5.rating,},
              ],
              diff: 0,
              matches: 0,
              played: 0,
            }
          ]
        },
        {
          title: "единственно возможный подбор",
          users: [user_1, user_2, user_3, user_4, user_5, user_6],
          courts: 2,
          pairs: [
            {
              players1: [
                {matches: 0, played: 0, name: `${user_1.lastname} ${user_1.firstname}`, user_id: 1, rating: user_1.rating,},
                {matches: 0, played: 0, name: `${user_2.lastname} ${user_2.firstname}`, user_id: 2, rating: user_2.rating,},
              ],
              players2: [
                {matches: 0, played: 0, name: `${user_3.lastname} ${user_3.firstname}`, user_id: 3, rating: user_3.rating,},
                {matches: 0, played: 0, name: `${user_5.lastname} ${user_5.firstname}`, user_id: 5, rating: user_5.rating,},
              ],
              diff: 0,
              matches: 0,
              played: 0,
            }
          ]
        },
        {
          title: "выбор из всех возможных",
          users: [user_1, user_2, user_3, user_4, user_5, user_6, user_7, user_8],
          courts: 2,
          pairs: [
            {
              players1: [
                {matches: 0, played: 0, name: `${user_1.lastname} ${user_1.firstname}`, user_id: 1, rating: user_1.rating,},
                {matches: 0, played: 0, name: `${user_2.lastname} ${user_2.firstname}`, user_id: 2, rating: user_2.rating,},
              ],
              players2: [
                {matches: 0, played: 0, name: `${user_3.lastname} ${user_3.firstname}`, user_id: 3, rating: user_3.rating,},
                {matches: 0, played: 0, name: `${user_5.lastname} ${user_5.firstname}`, user_id: 5, rating: user_5.rating,},
              ],
              diff: 0,
              matches: 0,
              played: 0,
            },
            {
              players1: [
                {matches: 0, played: 0, name: `${user_4.lastname} ${user_4.firstname}`, user_id: 4, rating: user_4.rating,},
                {matches: 0, played: 0, name: `${user_8.lastname} ${user_8.firstname}`, user_id: 8, rating: user_8.rating,},
              ],
              players2: [
                {matches: 0, played: 0, name: `${user_6.lastname} ${user_6.firstname}`, user_id: 6, rating: user_6.rating,},
                {matches: 0, played: 0, name: `${user_7.lastname} ${user_7.firstname}`, user_id: 7, rating: user_7.rating,},
              ],
              diff: 30,
              matches: 0,
              played: 0,
            },
          ]
        },
        {
          title: "выбор из всех возможных",
          users: [user_1, user_2, user_3, user_4, user_5, user_6, user_7, user_8, user_9, user_10],
          courts: 2,
          pairs: [
            {
              players1: [
                {matches: 0, played: 0, name: `${user_1.lastname} ${user_1.firstname}`, user_id: 1, rating: user_1.rating,},
                {matches: 0, played: 0, name: `${user_2.lastname} ${user_2.firstname}`, user_id: 2, rating: user_2.rating,},
              ],
              players2: [
                {matches: 0, played: 0, name: `${user_3.lastname} ${user_3.firstname}`, user_id: 3, rating: user_3.rating,},
                {matches: 0, played: 0, name: `${user_5.lastname} ${user_5.firstname}`, user_id: 5, rating: user_5.rating,},
              ],
              diff: 0,
              matches: 0,
              played: 0,
            },
            {
              players1: [
                {matches: 0, played: 0, name: `${user_4.lastname} ${user_4.firstname}`, user_id: 4, rating: user_4.rating,},
                {matches: 0, played: 0, name: `${user_6.lastname} ${user_6.firstname}`, user_id: 6, rating: user_6.rating,},
              ],
              players2: [
                {matches: 0, played: 0, name: `${user_8.lastname} ${user_8.firstname}`, user_id: 8, rating: user_8.rating,},
                {matches: 0, played: 0, name: `${user_9.lastname} ${user_9.firstname}`, user_id: 9, rating: user_9.rating,},
              ],
              diff: 0,
              matches: 0,
              played: 0,
            },
          ]
        },
      ]
      .forEach(data =>
          it(`где ${data.title} [ игр:${data.pairs.length}, кортов:${data.courts}, игроков:${data.users.length} ]`, async () => {
            const courtService = new CortService();
            for (let i = 1; i < data.courts; i++) {
              await courtService.create();
            }

            const userService = new UserService();
            for (let i = 0; i < data.users.length; i++) {
              await userService.create(
                  data.users[i].lastname,
                  data.users[i].firstname,
                  faker.person.middleName(),
                  1,
                  1,
                  faker.date.birthdate()
              );
              await userService.setRating(i + 1, data.users[i].rating);
            }
            // await userService.registerByIds(data.users.map(u => u.id));
            await userService.registerAll();

            assert.deepStrictEqual(await new CommonService().ready(), data.pairs);
          })
      );
    });

    describe('не должен находить пары', () => {
      it('когда нет кортов', async () => {
        await new CortService().deleteAll()
        assert.deepStrictEqual(await new CommonService().ready(), []);
      });
    });
  });
});