const UserRepository = require('../repositories/user')

class User {
  constructor() {
    if (User._instance) {
      return User._instance;
    }
    User._instance = this;

    this.repository = new UserRepository();
  }

  getAvailable = () => this.repository.getAvailable();
  getById = (id) => this.repository.getById(id);
  getAll = () => this.repository.getAll();
}

module.exports = User;