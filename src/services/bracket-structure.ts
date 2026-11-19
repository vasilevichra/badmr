// Чистая структура олимпийской сетки с доигровками: без БД, одна и та же
// для сервера (генерация/роутинг) и клиента (отображение).
//
// Инварианты:
// - узел сетки = матч; слот описывает место в структуре (stage/round/pos),
//   реальные матчи создаются лениво (см. bracket.ts), структура — только план;
// - посев: слоты 1..size, сид k занимает слот по бит-реверсу индекса;
//   сидов меньше size — недостающие слоты bye: команды верхних сидов
//   проходят раунд 1 без матча;
// - «две жизни»: проигравший матча верхнего раунда попадает в карман
//   (lower) уровня 1, разыгрывающий диапазон мест ниже победителя этого
//   раунда; проигравший lower-матча выбывает окончательно;
// - depth ограничивает вложенность карманов: 0 — без ограничения; при
//   исчерпанной глубине матчи кармана не создаются — команды делят его
//   диапазон мест по посеву, слоты глубже лимита отсутствуют в структуре.

export interface SlotRef {
  stage: 'upper' | 'lower';
  round: number;
  pos: number;
}

export interface BracketSlot extends SlotRef {
  // слоты-источники команд; null — сеяный слот (команды известны из seeds)
  feeders: [SlotRef, SlotRef] | null;
  // места посева слотов-источников: для upper R1 — сиды пары; 0 = «ожидается»
  seeds: [number, number];
  // разыгрываемый диапазон мест: победитель — placeFrom, проигравший — placeTo
  placeFrom: number;
  placeTo: number;
}

export interface BracketStructure {
  size: number;
  depthLimit: number;
  slots: BracketSlot[];
}

// минимальная степень двойки, не меньше n
export const bracketSize = (n: number): number => {
  assertTeams(n);
  let size = 1;
  while (size < n) {
    size *= 2;
  }
  return size;
};

const assertTeams = (n: number): void => {
  if (!Number.isInteger(n) || n < 2) {
    throw new Error(`ожидается целое число команд не меньше 2, получено: ${n}`);
  }
};

// бит-реверс k в поле из log2(size) бит: номер слота сида k (1..size)
export const slotIndexOfSeed = (k: number, size: number): number => {
  let index = 0;
  for (let bits = size >> 1; bits > 0; bits >>= 1) {
    index = (index << 1) | (k & 1);
    k >>= 1;
  }
  return index + 1;
};

// seedsInSlots[slot] = сид, занимающий слот (единый источник раскладки).
// Классическая раскладка строится рекурсией: L(1)=[1]; L(2n) получается
// из L(n) заменой каждого x парой [x, 2n+1−x] — для 8 даёт [1,8,5,4,3,6,7,2]
export const seedLayout = (size: number): number[] => {
  let pairs = [1];
  for (let span = 1; span < size; span *= 2) {
    pairs = pairs.flatMap(x => [x, 2 * span + 1 - x]);
  }
  const layout: number[] = [];
  pairs.forEach((seed, i) => {
    layout[i + 1] = seed;
  });
  return layout;
};

// --- (шаг 2: верхняя сетка) ---

// число созданных матчей раунда 1: пары соседних слотов из реальных команд
const createdR1Count = (size: number, n: number): number => {
  const layout = seedLayout(size);
  let count = 0;
  for (let pos = 1; pos <= size / 2; pos++) {
    if (layout[2 * pos - 1] <= n && layout[2 * pos] <= n) {
      count++;
    }
  }
  return count;
};

// диапазон мест, разыгрываемый матчем верхнего раунда round. Считается
// снизу вверх от n (не от size): при bye нижние места несуществующих пар
// исчезают, диапазоны сжимаются. Итог: R1-проигравшие — [n−c1+1..n],
// проигравшие раунда r≥2 — [placeTo(r−1)−c..placeTo(r−1)−1]; финал — [1..2]
const upperPlaceRange = (
  size: number, n: number, c1: number, round: number,
): [number, number] => {
  const count = round === 1 ? c1 : size / 2 ** round;
  const to = round === 1
    ? n
    : n - c1 - size / 2 + size / 2 ** (round - 1);
  const from = round === Math.log2(size) ? 1 : to - count + 1;
  return [from, to];
};

// матч раунда 1: пары соседних слотов (2p−1, 2p); матч — только если оба
// сеяных реальные, иначе верхний сид проходит раунд 1 без матча (bye)
const upperRound1 = (slots: BracketSlot[], size: number, n: number): void => {
  const layout = seedLayout(size);
  const c1 = createdR1Count(size, n);
  for (let pos = 1; pos <= size / 2; pos++) {
    const seedA = layout[2 * pos - 1];
    const seedB = layout[2 * pos];
    if (seedA > n || seedB > n) {
      continue;
    }
    const [placeFrom, placeTo] = upperPlaceRange(size, n, c1, 1);
    slots.push({
      stage: 'upper', round: 1, pos,
      feeders: null,
      seeds: [Math.min(seedA, seedB), Math.max(seedA, seedB)],
      placeFrom, placeTo,
    });
  }
};

// источник команды верхнего матча (раунд round ≥ 2, позиция pos): либо матч
// предыдущего раунда, либо bye-сеяный (round=0 — маркер bye, сид в seeds
// целевого слота); возвращает слот-источник и его сид (0 — «ожидается»)
const upperFeeder = (
  size: number, n: number, round: number, pos: number,
): [SlotRef, number] => {
  if (round === 1) {
    const layout = seedLayout(size);
    const seedA = layout[2 * pos - 1];
    const seedB = layout[2 * pos];
    if (seedA <= n && seedB <= n) {
      return [{ stage: 'upper', round: 1, pos }, 0];
    }
    // bye-позиция: матч раунда 1 не существует, реальный сид проходит сам
    return [{ stage: 'upper', round: 0, pos }, seedA <= n ? seedA : seedB];
  }
  return [{ stage: 'upper', round, pos }, 0];
};

// раунды 2..log2(size): feeders — победители парных матчей предыдущего
// раунда либо bye-сиды; у bye-источника сид кладётся в seeds
const upperRoundsRest = (slots: BracketSlot[], size: number, n: number): void => {
  const upperRounds = Math.log2(size);
  const c1 = createdR1Count(size, n);
  for (let round = 2; round <= upperRounds; round++) {
    const [placeFrom, placeTo] = upperPlaceRange(size, n, c1, round);
    for (let pos = 1; pos <= size / 2 ** round; pos++) {
      const [refA, seedA] = upperFeeder(size, n, round - 1, 2 * pos - 1);
      const [refB, seedB] = upperFeeder(size, n, round - 1, 2 * pos);
      slots.push({
        stage: 'upper', round, pos,
        feeders: [refA, refB],
        seeds: [seedA, seedB],
        placeFrom, placeTo,
      });
    }
  }
};

// --- (шаг 3: карманы доигровок) ---

// черновик lower-матча: round/pos присваиваются после сборки всех карманов
// (перенумерация по раундам), поэтому ссылки между черновиками — логические
type DraftRef =
  | { stage: 'upper'; round: number; pos: number }
  | { stage: 'lower'; originRound: number; level: number; seq: number };

interface LowerDraft {
  stage: 'lower';
  originRound: number; // верхний раунд, чьи проигравшие начали карман
  level: number;       // уровень вложенности (1 — первый матч кармана)
  seq: number;         // порядковый номер внутри (originRound, level)
  placeFrom: number;
  placeTo: number;
  feeders: [DraftRef, DraftRef];
}

// нумерация lower-слотов: round = originRound + level − 1; внутри раунда
// матчи упорядочены по placeFrom (матч за 3-4 — первый в своём раунде),
// pos — порядковый номер после сортировки
const renumberPockets = (drafts: LowerDraft[]): BracketSlot[] => {
  const byRound = new Map<number, LowerDraft[]>();
  for (const d of drafts) {
    const round = d.originRound + d.level - 1;
    const list = byRound.get(round) ?? [];
    list.push(d);
    byRound.set(round, list);
  }
  // глобальная карта черновик → финальный слот (фидеры бывают из соседних
  // раундов, поэтому resolve идёт по полной карте, а не по текущему раунду)
  const finalOf = new Map<string, SlotRef>();
  for (const [round, list] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.placeFrom - b.placeFrom || a.placeTo - b.placeTo || a.seq - b.seq);
    list.forEach((d, i) =>
      finalOf.set(keyOf(d), { stage: 'lower', round, pos: i + 1 }));
  }
  const resolve = (ref: DraftRef): SlotRef => {
    if (ref.stage === 'upper') {
      return { stage: 'upper', round: ref.round, pos: ref.pos };
    }
    return finalOf.get(`${ref.originRound}:${ref.level}:${ref.seq}`)!;
  };
  return drafts.map(d => ({
    stage: 'lower',
    round: finalOf.get(keyOf(d))!.round,
    pos: finalOf.get(keyOf(d))!.pos,
    feeders: [resolve(d.feeders[0]), resolve(d.feeders[1])],
    seeds: [0, 0] as [number, number],
    placeFrom: d.placeFrom,
    placeTo: d.placeTo,
  }));
};

const keyOf = (d: LowerDraft): string => `${d.originRound}:${d.level}:${d.seq}`;

// карман на m команд, разыгрывающий места [lo..lo+m-1], уровень level.
// parents — m слотов-источников (верхние матчи для уровня 1, матчи родного
// кармана для глубже), каждый отдаёт карману одну команду (проигравшего или
// победителя); сеяние внутри кармана — бит-реверс по порядку родителей.
// Победители матчей уровня → подкарман [lo..lo+m/2-1], проигравшие →
// [lo+m/2..lo+m-1]; рекурсия до m < 2 или исчерпания depth.
const pocketDrafts = (
  drafts: LowerDraft[],
  originRound: number,
  m: number,
  lo: number,
  level: number,
  depthLimit: number,
  parents: DraftRef[],
): void => {
  if (m < 2 || (depthLimit !== 0 && level > depthLimit)) {
    return;
  }
  const seqBase = drafts.filter(d => d.originRound === originRound && d.level === level).length;
  const layout = seedLayout(m);
  const own: LowerDraft[] = [];
  for (let p = 1; p <= m / 2; p++) {
    // пара родителей: сеяные кармана 2p−1 и 2p по классической раскладке
    const a = parents[layout[2 * p - 1] - 1];
    const b = parents[layout[2 * p] - 1];
    const draft: LowerDraft = {
      stage: 'lower',
      originRound, level, seq: seqBase + p - 1,
      placeFrom: lo, placeTo: lo + m - 1,
      feeders: [a, b],
    };
    own.push(draft);
    drafts.push(draft);
  }
  pocketDrafts(drafts, originRound, m / 2, lo, level + 1, depthLimit, own);
  pocketDrafts(drafts, originRound, m / 2, lo + m / 2, level + 1, depthLimit, own);
};

// --- (шаг 4: роутинг и сборка) ---

const findSlot = (s: BracketStructure, ref: SlotRef): BracketSlot | undefined =>
  s.slots.find(x => x.stage === ref.stage && x.round === ref.round && x.pos === ref.pos);

// команды целевого слота, когда оба питателя отдали по команде; null — пока
// не готово. finishedFeeders возвращает [победитель, проигравший] питателя
// или null (ещё не завершён / не сеяный). Bye-слот (round=0) отдаёт свой сид.
export const readySlot = (
  s: BracketStructure,
  ref: SlotRef,
  finishedFeeders: (slot: SlotRef) => [number | null, number | null],
): [number, number] | null => {
  const slot = findSlot(s, ref);
  if (!slot) {
    return null;
  }
  // bye-слот в feeders: round=0, команда — сид (хранится в seeds слота).
  // Правило зависит от стадии цели: upper-цель берёт победителя upper-питателя;
  // карман (lower-цель) — проигравшего upper-питателя, а из lower-питателя —
  // победителя, если цель в верхней половине его диапазона (подкарман
  // победителей начинается с placeFrom питателя), иначе проигравшего
  const teamOf = (feeder: SlotRef, index: 0 | 1): number | null => {
    if (feeder.round === 0) {
      return slot.seeds[index] || null;
    }
    const [win, lose] = finishedFeeders(feeder);
    let take: number | null;
    if (slot.stage === 'lower' && feeder.stage === 'upper') {
      take = lose;
    } else if (slot.stage === 'lower' && feeder.stage === 'lower') {
      const feederSlot = findSlot(s, feeder);
      take = feederSlot && slot.placeFrom === feederSlot.placeFrom ? win : lose;
    } else {
      take = win;
    }
    return take ?? null;
  };
  if (slot.feeders === null) {
    return null; // сеяный слот R1 создаётся при генерации, не роутингом
  }
  const a = teamOf(slot.feeders[0], 0);
  const b = teamOf(slot.feeders[1], 1);
  return a !== null && b !== null ? [a, b] : null;
};

// сборка: верхняя сетка + карманы проигравших
export const structure = (n: number, depth: number): BracketStructure => {
  assertTeams(n);
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error(`глубина доигровок — целое число не меньше 0, получено: ${depth}`);
  }
  const size = bracketSize(n);
  const slots: BracketSlot[] = [];
  upperRound1(slots, size, n);
  upperRoundsRest(slots, size, n);

  const upperRounds = Math.log2(size);
  const c1 = createdR1Count(size, n);
  const drafts: LowerDraft[] = [];
  for (let round = 1; round < upperRounds; round++) {
    // карман = диапазон мест проигравших раунда round: m матчей раунда →
    // m проигравших за места [placeFrom .. placeTo] этого раунда
    const m = round === 1 ? c1 : size / 2 ** round;
    const [lo, placeTo] = upperPlaceRange(size, n, c1, round);
    const parents: DraftRef[] = [];
    for (let pos = 1; pos <= m; pos++) {
      parents.push({ stage: 'upper', round, pos });
    }
    pocketDrafts(drafts, round, m, lo, 1, depth, parents);
  }
  slots.push(...renumberPockets(drafts));

  return { size, depthLimit: depth, slots };
};
