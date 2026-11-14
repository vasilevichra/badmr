import GroupRepository from '../repositories/group.ts';

class Group {
  declare static _instance: Group | undefined;
  group!: GroupRepository;

  constructor() {
    if (Group._instance) {
      return Group._instance;
    }
    Group._instance = this;

    this.group = new GroupRepository();
  }

  select = () => this.group.select();
  getAll = (tournamentId?: number) => this.group.getAll(tournamentId);
}

export default Group;