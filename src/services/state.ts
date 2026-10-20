import StateRepository from '../repositories/state.ts';

class State {
  declare static _instance: State | undefined;
  state!: StateRepository;

  constructor() {
    if (State._instance) {
      return State._instance;
    }
    State._instance = this;

    this.state = new StateRepository();
  }

  getById = (id: number) => this.state.getById(id);
  select = () => this.state.select();
  getByUserId = (user_id: number) => this.state.getByUserId(user_id);
}

export default State;