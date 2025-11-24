const sqlite3 = require('sqlite3');
const Promise = require('bluebird');

class DB {

  constructor(dbFilePath) {
    this.db = new sqlite3.Database(
        dbFilePath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        (err) => {
          if (err) {
            console.error("Error connecting to SQLite database:", err);
          } else {
            console.log(`Connected to SQLite database in ${process.env.NODE_ENV} mode`);
          }
        }
    )
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          console.log('Error running sql ' + sql)
          console.log(err)
          reject(err)
        } else {
          resolve({id: this.lastID})
        }
      })
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, result) => {
        if (err) {
          console.log('Error running sql: ' + sql)
          console.log(err)
          reject(err)
        } else {
          resolve(result)
        }
      })
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.log('Error running sql: ' + sql)
          console.log(err)
          reject(err)
        } else {
          resolve(rows)
        }
      })
    });
  }

  database() {
    return this.db;
  }
}

module.exports = DB
