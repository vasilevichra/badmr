import UserClubRepository from '../repositories/user-club.ts';

class UserClub {
  declare static _instance: UserClub | undefined;
  userClub!: UserClubRepository;

  constructor() {
    if (UserClub._instance) {
      return UserClub._instance;
    }
    UserClub._instance = this;

    this.userClub = new UserClubRepository();
  }

  select = () => this.userClub.select();
}

export default UserClub;