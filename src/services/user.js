const UserRepository = require('../repositories/user')

class User {
  constructor() {
    if (User._instance) {
      return User._instance;
    }
    User._instance = this;

    this.user = new UserRepository();
  }

  getAll = () => this.user.getAll();
  getById = (id) => this.user.getById(id);
  registerAll = () => this.user.registerAll();
  registerById = (id) => this.user.registerById(id);
  deregisterAll = () => this.user.deregisterAll();
  deregisterById = (id) => this.user.deregisterById(id);
}

module.exports = User;