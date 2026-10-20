import SettingsRepository from '../repositories/settings.ts';
import ReadyPriorityService from './ready-priority.ts';
const readyPriorityService = new ReadyPriorityService();

class Settings {
  declare static _instance: Settings | undefined;
  settings!: SettingsRepository;
  opt: Record<string, string> = {
    DELTA: 'delta',
    PROC: 'proc',
    TYPE: 'type',
    PRIORITY: 'priority',
  };

  // ограничения значений из схемы БД: CHECK нижних границ defaults
  // и триггеры перекрёстных ограничений действуют только на defaults,
  // здесь они повторяются для переопределений турнира в tournament_settings
  private static readonly INTEGER_MIN: Record<string, number> = {
    delta: 0, proc: 0, matches: 0, wins: 1, game_point: 1, max_point: 1, capacity: 1, courts: 1,
  };
  private static readonly POSITIVE: Record<string, number> = {
    fee: 0, B_max: 0, C_max: 0, D_max: 0, E_max: 0, F_max: 0, G_max: 0, H_max: 0, r_min: 0,
  };
  private static readonly GREATER_THAN: Record<string, string> = {
    max_point: 'game_point',
    B_max: 'C_max', C_max: 'D_max', D_max: 'E_max',
    E_max: 'F_max', F_max: 'G_max', G_max: 'H_max',
  };
  // обратные стороны тех же пар: меньшая сторона не должна подняться до большей
  private static readonly NOT_MORE: Record<string, string> = {
    game_point: 'max_point',
    C_max: 'B_max', D_max: 'C_max', E_max: 'D_max',
    F_max: 'E_max', G_max: 'F_max', H_max: 'G_max',
    r_min: 'r_max',
  };
  private static readonly NOT_LESS: Record<string, string> = {r_max: 'r_min'};

  private static error = (message: string) => {
    const error = new Error(message) as Error & { status?: number };
    error.status = 400;
    return error;
  };

  private assertValid = async (name: string, value: string) => {
    if (name === 'priority') {
      const ids = value.split(',');
      if (!/^[0-9]+(,[0-9]+)*$/.test(value) || new Set(ids).size !== ids.length) {
        throw Settings.error('priority должен быть списком уникальных id из ready_priority, разделённых запятой');
      }
      const known = new Set((await readyPriorityService.select()).map((r) => Number(r.id)));
      if (!ids.every((id) => known.has(Number(id)))) {
        throw Settings.error('priority содержит неизвестный id из ready_priority');
      }
      return;
    }
    if (!(name in Settings.INTEGER_MIN) && !(name in Settings.POSITIVE)) {
      return; // селекторные настройки (state/region/city/timezone/type) — id справочников
    }
    if (!/^\d+$/.test(value)) {
      throw Settings.error(`${name} должен быть целым числом`);
    }
    const n = Number(value);
    if (name in Settings.INTEGER_MIN && n < Settings.INTEGER_MIN[name]) {
      throw Settings.error(`${name} должен быть не меньше ${Settings.INTEGER_MIN[name]}`);
    }
    if (name in Settings.POSITIVE && n <= Settings.POSITIVE[name]) {
      throw Settings.error(`${name} должен быть больше ${Settings.POSITIVE[name]}`);
    }
    if (name in Settings.GREATER_THAN && n <= Number(await this.get(Settings.GREATER_THAN[name]))) {
      throw Settings.error(`${name} должен быть больше ${Settings.GREATER_THAN[name]}`);
    }
    if (name in Settings.NOT_MORE && n >= Number(await this.get(Settings.NOT_MORE[name]))) {
      throw Settings.error(`${name} должен быть меньше ${Settings.NOT_MORE[name]}`);
    }
    if (name in Settings.NOT_LESS && n < Number(await this.get(Settings.NOT_LESS[name]))) {
      throw Settings.error(`${name} должен быть не меньше ${Settings.NOT_LESS[name]}`);
    }
  };

  constructor() {
    if (Settings._instance) {
      return Settings._instance;
    }
    Settings._instance = this;

    this.settings = new SettingsRepository();
    this.opt = {
      DELTA: 'delta',
      PROC: 'proc',
      TYPE: 'type',
      PRIORITY: 'priority',
    };
  }

  get = (name: string) => this.settings.get(name)!.value;
  getAll = () => this.settings.getAll();
  set = async (name: string, value: string) => {
    await this.assertValid(name, String(value));
    return this.settings.set(name, value);
  };
  getSettings = () => this.settings.getSettings();
  getTimezone = () => this.settings.getTimezone();
  getDefaults = () => this.settings.getDefaults();
  states = () => this.settings.states();
  regions = () => this.settings.regions();
  cities = () => this.settings.cities();
}

export default Settings;
