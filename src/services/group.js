const GroupRepository = require('../repositories/group');

class Group {
  constructor() {
    if (Group._instance) {
      return Group._instance;
    }
    Group._instance = this;

    this.group = new GroupRepository();
  }

  select = () => this.group.select();
  getAll = () => this.group.getAll();
}

module.exports = Group;