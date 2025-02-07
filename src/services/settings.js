const SettingsRepository = require('../repositories/settings')

class Settings {
  constructor() {
    if (Settings._instance) {
      return Settings._instance;
    }
    Settings._instance = this;

    this.settings = new SettingsRepository();
    this.opt = {
      DELTA: 'delta',
      TYPE: 'type',
    };
  }

  get = (name) => this.settings.get(name).then((result) => result.value);
  getAll = () => this.settings.getAll();
}

module.exports = Settings;