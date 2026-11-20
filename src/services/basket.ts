import SettingsService from './settings.ts';
import TeamRepository from '../repositories/team.ts';
import GroupRepository from '../repositories/group.ts';

class Basket {
  declare static _instance: Basket | undefined;
  settings!: SettingsService;
  team!: TeamRepository;
  group!: GroupRepository;

  constructor() {
    if (Basket._instance) {
      return Basket._instance;
    }
    Basket._instance = this;

    this.settings = new SettingsService();
    this.team = new TeamRepository();
    this.group = new GroupRepository();
  }

  /** Буква котла из имени группы: одиночная буква a-h, иначе null —
   *  мультибуквенные группы (AB, BC, …) корзин не имеют. */
  letter(groupName: string): string | null {
    return /^[a-h]$/i.test(groupName) ? groupName.toLowerCase() : null;
  }

  /** Id группы-котла по букве (имена групп глобальные). */
  groupIdByLetter(letter: string): number | null {
    return this.group.byName(letter.toUpperCase())?.id ?? null;
  }

  private letterByGroup(groupId: number): string | null {
    const g = this.group.getById(groupId);
    return g ? this.letter(g.name) : null;
  }

  /** Схема проведения котла: 1 - олимпийка с корзинами, 2 - круговая.
   *  Котёл без буквы (AB, …) — всегда круговая. */
  orgSystem(tournamentId: number | undefined, groupId: number): 1 | 2 {
    const letter = this.letterByGroup(groupId);
    return letter && this.settings.get(`org_system.${letter}`, tournamentId) === '1' ? 1 : 2;
  }

  /** Размер корзины группового этапа котла. */
  residents(tournamentId: number | undefined, groupId: number): number {
    const letter = this.letterByGroup(groupId);
    return Number(letter ? this.settings.get(`group_residents.${letter}`, tournamentId) : '4');
  }

  /** Есть ли у котла групповой этап: олимпийка с корзинами больше одной команды. */
  groupStage(tournamentId: number | undefined, groupId: number): boolean {
    return this.orgSystem(tournamentId, groupId) === 1 && this.residents(tournamentId, groupId) > 1;
  }

  /** Идемпотентная раскладка команд котла по корзинам: в порядке id,
   *  корзины по `residents` (1,1,…,2,2,…); дырки после удалений схлопываются. */
  layout(tournamentId: number | undefined, groupId: number): void {
    const residents = this.residents(tournamentId, groupId);
    if (residents < 1) return;
    // в порядке id: корзины по residents (1,1,…,2,2,…); дырки после удалений схлопываются
    this.team.byGroup(groupId).forEach((t, i) => {
      const basket = Math.floor(i / residents) + 1;
      if (t.basket !== basket) this.team.setBasket(t.id, basket);
    });
  }

  /** Без группового этапа корзин нет: basket = NULL всем командам котла. */
  clear(tournamentId: number | undefined, groupId: number): void {
    for (const t of this.team.byGroup(groupId)) {
      if (t.basket !== null) this.team.setBasket(t.id, null);
    }
  }

  /** Хук добавления команды: у котла с групповым этапом пересобираем
   *  раскладку (команда попадает в первую неполную корзину или в новую). */
  onTeamAdded(tournamentId: number | undefined, groupId: number): void {
    if (this.groupStage(tournamentId, groupId)) {
      this.layout(tournamentId, groupId);
    }
  }

  /** Хук сохранения org_system.<буква>: при групповом этапе ('1' и
   *  residents > 1) раскладываем котёл, иначе корзин нет — сбрасываем.
   *  Прочие настройки — no-op. */
  onOrgSystemSet(tournamentId: number | undefined, name: string, value: string): void {
    const m = /^org_system\.([a-h])$/.exec(name);
    if (!m) return;
    const groupId = this.groupIdByLetter(m[1]);
    if (groupId === null) return;
    if (value === '1' && this.groupStage(tournamentId, groupId)) {
      this.layout(tournamentId, groupId);
    } else {
      this.clear(tournamentId, groupId);
    }
  }

  /** team_id → номер корзины для фильтрации standings/матриц по корзине. */
  baskets(groupId: number): Map<number, number | null> {
    return new Map(this.team.byGroup(groupId).map(t => [t.id, t.basket]));
  }
}

export default Basket;
