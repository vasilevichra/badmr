const SettingsRepository = require('../repositories/settings')

class Settings {
  constructor() {
    if (Settings._instance) {
      return Settings._instance;
    }
    Settings._instance = this;

    this.repository = new SettingsRepository();
    this.opt = {
      DELTA: 'delta',
      TYPE: 'type',
    };
  }

  get = (name, tournament_id) => this.repository.get(name, tournament_id).then((result) => result.value);
}

module.exports = Settings;