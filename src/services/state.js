const StateRepository = require('../repositories/state');

class State {
  constructor() {
    if (State._instance) {
      return State._instance;
    }
    State._instance = this;

    this.state = new StateRepository();
  }

  getById = (id) => this.state.getById(id);
  select = () => this.state.select();
  getByUserId = (user_id) => this.state.getByUserId(user_id);
}

module.exports = State;