const StateRepository = require('../repositories/state');

class State {
  constructor() {
    if (State._instance) {
      return State._instance;
    }
    State._instance = this;

    this.state = new StateRepository();
  }

  getByUserId = (user_id) => this.state.getByUserId(user_id);
}

module.exports = State;