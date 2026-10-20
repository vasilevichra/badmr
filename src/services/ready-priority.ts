import ReadyPriorityRepository from '../repositories/ready-priority.ts';

class ReadyPriority {
  declare static _instance: ReadyPriority | undefined;
  readyPriority!: ReadyPriorityRepository;

  constructor() {
    if (ReadyPriority._instance) {
      return ReadyPriority._instance;
    }
    ReadyPriority._instance = this;

    this.readyPriority = new ReadyPriorityRepository();
  }

  select = () => this.readyPriority.select();
}

export default ReadyPriority;
