class Repository {

  constructor(db) {
    this.db = db
  }

  createUser(lastname, firstname, patronomic, sex, city_id, birthday) {
    return this.db.run(
        `INSERT INTO user (lastname, firstname, patronomic, sex, city_id, birthday)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [lastname, firstname, patronomic, sex, city_id, birthday]
    )
  }

  ready() {
    return this.db.all(
        `SELECT *
         FROM ready`
    );
  }

  getUserById(id) {
    return this.db.get(
        `SELECT *
         FROM user
         WHERE id = ?`,
        [id]
    );
  }

  getAvailableCourts() {
    return this.db.all(
        `SELECT c.number,
         FROM tournament t
                  JOIN court c ON t.id = c.tournament_id
         WHERE t.available = 1
           AND c.available = 1`
    );
  }

}

module.exports = Repository;