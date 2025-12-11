const UserRepository = require('../repositories/user')

class User {
  constructor() {
    if (User._instance) {
      return User._instance;
    }
    User._instance = this;

    this.user = new UserRepository();
  }

  add = (lastname, firstname, patronymic, sex, city_id, birthday) => this.user.add(lastname, firstname, patronymic, sex, city_id, birthday)
  getAll = () => this.user.getAll();
  getArchived = () => this.user.getArchived();
  getById = (id) => this.user.getById(id);
  registerAll = () => this.user.registerAll();
  registerById = (id) => this.user.registerById(id);
  deregisterAll = () => this.user.deregisterAll();
  deregisterById = (id) => this.user.deregisterById(id);
  actualize = () => this.user.actualize();
  archive = (id) => this.user.archive(id);
  archiveAll = () => this.user.archiveAll();
  unarchive = (id) => this.user.unarchive(id);
  unarchiveAll = () => this.user.unarchiveAll();
  getRating = (id) => this.user.getRating(id);
  setRating = (id, rating) => this.user.setRating(id, rating);
}

module.exports = User;
