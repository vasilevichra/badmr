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
      SORT: 'sort',
    };
  }

  get = (name) => this.settings.get(name).then((result) => result.value);
  getAll = () => this.settings.getAll();
  states = () => this.settings.states();
  regions = () => this.settings.regions();
  cities = () => this.settings.cities();
}

module.exports = Settings;
