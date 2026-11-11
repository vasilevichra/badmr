import SettingsRepository from '../repositories/settings.ts';

class Settings {
  declare static _instance: Settings | undefined;
  settings!: SettingsRepository;
  opt: Record<string, string> = {
    DELTA: 'delta',
    PROC: 'proc',
    TYPE: 'type',
  };

  // ограничения значений из схемы БД: CHECK нижних границ defaults
  // и триггеры перекрёстных ограничений действуют только на defaults,
  // здесь они повторяются для переопределений турнира в tournament_settings
  private static readonly INTEGER_MIN: Record<string, number> = {
    delta: 0, proc: 0, matches: 0, wins: 1, game_point: 1, max_point: 1, capacity: 1, courts: 1,
    rating_diff_limit: 0, rating_diff_divisor: 1,
    rematch_window: 0, delta_auto_window: 0, delta_auto_lower: 0, delta_auto_upper: 0, game_break: 0,
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
  // boolean-настройки: на defaults действует CHECK, здесь повторяем для
  // переопределений турнира в tournament_settings
  private static readonly BOOLEAN = new Set(['fifty', 'delta_auto']);

  private static error = (message: string) => {
    const error = new Error(message) as Error & { status?: number };
    error.status = 400;
    return error;
  };

  // настройки, релевантные типу турнира: у 110 свой регламент (матч до
  // 110 очков, свой счёт и смена сторон), матчмейкинг, рейтинговые группы
  // и формулы дельты НЛ к нему не относятся — из таблицы настроек их
  // прячем. Отсутствующий тип (или null) — показывать все настройки,
  // как у Новой лиги
  private static readonly RELEVANT: Record<number, ReadonlySet<string> | null> = {
    2: new Set(['state', 'region', 'city', 'timezone', 'capacity', 'courts', 'fee', 'r_min', 'r_max', 'type', 'game_break']),
  };

  private assertValid = async (name: string, value: string) => {
    if (name === 'type') {
      // тип соревнований задаётся при создании турнира и не редактируется
      throw Settings.error('type — нередактируемая настройка');
    }
    if (Settings.BOOLEAN.has(name)) {
      if (value !== '0' && value !== '1') {
        throw Settings.error(`${name} должен быть 0 или 1`);
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
      FIFTY: 'fifty',
      DELTA_AUTO: 'delta_auto',
      REMATCH_WINDOW: 'rematch_window',
      DELTA_AUTO_WINDOW: 'delta_auto_window',
      DELTA_AUTO_LOWER: 'delta_auto_lower',
      DELTA_AUTO_UPPER: 'delta_auto_upper',
      WINS: 'wins',
    };
  }

  get = (name: string, tournamentId?: number) => this.settings.get(name, tournamentId)!.value;
  /** Список настроек с оверрайдами турнира; relevantOnly — только
   *  релевантные типу этого турнира (см. RELEVANT). */
  getAll = (tournamentId?: number, relevantOnly = false) => {
    const rows = this.settings.getAll(tournamentId);
    if (!relevantOnly) return rows;
    const relevant = Settings.RELEVANT[this.settings.getType(tournamentId)] ?? null;
    return relevant ? rows.filter(row => relevant.has(row.name)) : rows;
  };
  set = async (name: string, value: string) => {
    await this.assertValid(name, String(value));
    return this.settings.set(name, value);
  };
  getSettings = (tournamentId?: number) => this.settings.getSettings(tournamentId);
  getTimezone = (tournamentId?: number) => this.settings.getTimezone(tournamentId);
  getDefaults = () => this.settings.getDefaults();
  states = (tournamentId?: number) => this.settings.states(tournamentId);
  regions = (tournamentId?: number) => this.settings.regions(tournamentId);
  cities = (tournamentId?: number) => this.settings.cities(tournamentId);
}

export default Settings;
