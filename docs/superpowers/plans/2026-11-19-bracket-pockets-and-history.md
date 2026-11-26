# Олимпийская сетка 110: цепочка доигровок, нечётные карманы и историческая реконструкция

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Починить роутинг «двух жизней» в олимпийской сетке 110 (проигравшие в карманы, создание матчей карманов уровня 2+, краш структуры на 7/11/13–15/19–31 командах, фантомные матчи при byes) и показать для архивных 110-турниров реконструкцию сыгранной сетки по котлам.

**Architecture:** Правки концентрируются в чистой структуре `src/services/bracket-structure.ts` (готовность слота, сборка карманов) и сервисе `src/services/bracket.ts` (роутинг по завершении матча, генерация). Историческая сетка — отдельный сервис без записи в БД + серверный EJS-партиал: архивы статичны, клиентский JS не трогаем (кроме skip виртуальных слотов).

**Tech Stack:** Node (`--experimental-strip-types`, без сборки), node:sqlite, собственный тест-раннер, EJS.

**Spec:** Решения пользователя в этой сессии: (1) для прошедших 110-турниров показывать сразу сыгранную сетку — реконструкция дерева; исторический формат — «две сетки: котлы C и D, две жизни, некоторые игры не игрались»; (2) баг структуры для 7/13/14 команд чинить сейчас.

## Global Constraints

- TypeScript исполняется напрямую, импорты всегда с расширением `.ts`, сборки нет.
- Новые миграции не создавать (не требуются). Migrations править только по согласованию.
- Комментарии и идентификаторы — на русском; комментарий объясняет инвариант.
- Точечный прогон: `rm -f .data/test-*.db && NODE_ENV=test node --experimental-strip-types --test <файл>`.
- Полный гейт: `rm -f .data/test-*.db .data/test.stamp && npm run test` (все зелёные) + `npm run typecheck` (≤ 43 ошибок — база).
- Коммиты — префикс `fix:`/`feat:`, ветка `feature/tournament-brackets`.
- Не коммитить: `.gitignore`, `package*.json`, `.idea/*`, `*.png`, `iphone-test.mjs`, планы.

## Review Focus

- Нечётное число проигравших в кармане (n = 7, 11, 13–15…): карман должен покрыть все места диапазона, без краша и потерянных команд.
- Каскад byes (n = 5, 6): матч второго раунда с двумя bye-питателями должен существовать сразу после генерации; фантомные слоты не должны рендериться как «ожидается соперник» вечно.
- Глубина доигровок 0 (без ограничения) vs 1/2: матчи уровня > depthLimit не создаются, места делятся по посеву.
- Идемпотентность роутинга: повторный onMatchFinished не создаёт дублей.
- Историческая реконструкция: матчи без слотов, разбивка на котлы строго по `team.group_id`, порядок раундов по id матчей.

---

### Task 1: readySlot — из питателя в карман идёт проигравший

**Files:**
- Modify: `src/services/bracket-structure.ts:302-325` (`readySlot`, внутренняя `teamOf`)
- Test: `tests/services/bracket.test.ts`

**Interfaces:**
- Consumes: `finishedFeeders(slot) => [winner | null, loser | null]` (уже возвращает пару, bracket.ts:124-134).
- Produces: `readySlot(s, ref, finishedFeeders): [number, number] | null` — сигнатура не меняется; меняется правило выбора команды.

Правило выбора зависит от стадии **цели** и питателя: цель upper (раунды 2+) — из upper-питателя идёт **победитель** (как сейчас); цель lower (карман) — из upper-питателя идёт **проигравший**, из lower-питателя — **победитель**, если целевой слот лежит в верхней половине диапазона питателя (`target.placeFrom === feederSlot.placeFrom`), иначе проигравший; bye-питатель (round=0) — сид из `slot.seeds` (как сейчас). Слот питателя искать `findSlot(s, feeder)` — lower-слоты есть в `s.slots` после `renumberPockets`.

- [ ] **Step 1: failing test** — в `tests/services/bracket.test.ts` в describe «роутинг по завершении матча» добавить:

```ts
it("полный раунд: в матчи кармана попадают проигравшие R1", async () => {
  const seedToTeam = await seedTeams(8);
  await bracketService.generate();
  for (const m of slotRows().filter(r => r.stage === 'upper' && r.round === 1)) {
    finishMatch(m.id, m.team_1_id); // побеждает верхний сид пары
  }
  const seedsOf = (m: SlotRow) =>
      [m.team_1_id, m.team_2_id].map(t => [...seedToTeam.entries()].find(([, id]) => id === t)![0])
          .sort((a, b) => a - b);
  const lower = slotRows().filter(r => r.stage === 'lower' && r.round === 1)
      .sort((a, b) => a.pos - b.pos);
  // пары кармана сеются по layout(4)=[1,4,3,2]: (U1p1,U1p4) и (U1p3,U1p2);
  // team_1 (минимальный сид) побеждает: проигравшие U1p1→8, U1p2→5, U1p3→6, U1p4→7
  assert.deepStrictEqual(seedsOf(lower[0]), [7, 8]);
  assert.deepStrictEqual(seedsOf(lower[1]), [5, 6]);
});
```

- [ ] **Step 2:** прогнать — ожидаемо FAIL (в карманах победители).
- [ ] **Step 3:** реализовать правило выбора в `teamOf` (см. выше).
- [ ] **Step 4:** прогнать файл — PASS; убедиться, что старые тесты роутинга (состав R2, счётчик lower) не сломались.
- [ ] **Step 5:** commit `fix: в матчи карманов доигровок попадают проигравшие питателей`.

### Task 2: onMatchFinished — создание матчей по скану питателей

**Files:**
- Modify: `src/services/bracket.ts:101-118` (`onMatchFinished`), удалить `targetOf` из импорта
- Modify: `src/services/bracket-structure.ts:265-294` (удалить `targetOf`)
- Modify: `tests/services/bracket-structure.test.ts` (убрать describe targetOf), `tests/services/bracket.test.ts`

**Interfaces:**
- Produces: `onMatchFinished(match110Id)` — после завершения любого слотового матча (upper/lower) создаёт все слоты, у которых данный слот — один из `feeders` (round ≥ 1), через `createIfReady` (идемпотентен по `getBySlot`).

Причина: сейчас lower-цели не роутятся (`targetOf` для lower → null), поэтому матчи карманов уровня 2+ не создаются никогда (подтверждено скриптом: после завершения L1 матчей L2 нет).

- [ ] **Step 1: failing test** — «после завершения матчей кармана уровня 1 созданы матчи уровня 2» (8 команд, consolation_depth=2): завершить 4 матча R1 (побеждает сид 1), затем 2 матча L1 (побеждает team_1); ожидание: 2 lower-слота round 2 с составами победителей L1 и проигравших L1 (пары по половинам диапазона кармана: L2 winners = победители L1p1+L1p2, L2 losers = проигравшие L1p1+L1p2).
- [ ] **Step 2:** прогнать — FAIL (L2 не создаётся).
- [ ] **Step 3:** в `onMatchFinished` заменить цикл по `['win','lose']`+`targetOf` на скан: `s.slots.filter(slot => slot.feeders?.some(f => f.stage === from.stage && f.round === from.round && f.pos === from.pos))` → `createIfReady` для каждого. Удалить `targetOf` из bracket-structure.ts и его тесты.
- [ ] **Step 4:** прогнать оба тест-файла — PASS; особое внимание тесту «после двух матчей R1 создан матч R2…» (карман «ещё не готов» остаётся верным: питатель не завершён).
- [ ] **Step 5:** commit `fix: матчи карманов уровня 2+ создаются после завершения питателей`.

### Task 3: сборка карманов для произвольного m + родители = реальные матчи

**Files:**
- Modify: `src/services/bracket-structure.ts` (заменить `pocketDrafts` 231-261, цикл в `structure` 341-351)
- Test: `tests/services/bracket-structure.test.ts`

**Interfaces:**
- Produces: `structure(n, depth)` не падает ни для какого n ≥ 2; карман произвольного размера m строится по классической раскладке на M = next-pow2(m): пары по `seedLayout(M)`, пара с одним несуществующим родителем — bye (родитель проходит в подкарман победителей без матча), обе реальные — матч уровня `level` с диапазоном `[lo..lo+m-1]`; рекурсия: подкарман победителей — `[lo..lo+M/2-1]` (родители: bye-родители и матчи уровня в порядке сидов), подкарман проигравших — `[lo+M/2..lo+m-1]` (родители — матчи уровня). `m < 2` или `level > depthLimit` (0 — без ограничения) — стоп.
- Родители кармана раунда r — только **реальные** матчи раунда (сейчас берутся pos 1..m, а при byes реальные матчи не в первых позициях: n=7 → pos 2,3,4). Реальность матча (round, pos): оба поддерева-питателя содержат хотя бы по одной реальной команде. Помощник: число реальных сидов в поддереве позиции через `seedLayout(size)` (диапазон индексов поддерева).

- [ ] **Step 1: failing tests** в `bracket-structure.test.ts`:
  - `structure(7, 2)` не бросает; lower-слоты round 1: 1 матч (m=3 → 1 пара), round 2: 1 матч, его feeders = [upper U1p2, lower round-1] (bye-родитель — сильнейший проигравший, U1p2).
  - `structure(5, 0)`: lower-слоты только от реального U2p1... для n=5 c1=1 → карман R1 отсутствует; карман R2 — родителей 1 → матчей нет (`slots.filter(lower).length === 0`).
  - регресс: `structure(8, 2)` — прежние счётчики lower-слотов не изменились.
- [ ] **Step 2:** прогнать — FAIL (краш на n=7).
- [ ] **Step 3:** реализовать генерализованный карман + родителей из реальных позиций (алгоритм выше, в интерфейсах).
- [ ] **Step 4:** прогнать — PASS.
- [ ] **Step 5:** commit `fix: карманы доигровок для нечётного числа проигравших и фантомных матчей`.

### Task 4: генерация — pre-create матчей с двумя bye-питателями; virtual-слоты

**Files:**
- Modify: `src/services/bracket.ts:88-98` (`generate`)
- Modify: `src/services/bracket-structure.ts` (`BracketSlot` + `upperRoundsRest`: пометка `virtual`)
- Modify: `src/public/js/bracket.js` (skip virtual-слотов в рендере колонок/мобайл)
- Test: `tests/services/bracket.test.ts`, смоук bracket-structure.test.ts

**Interfaces:**
- Produces: `BracketSlot.virtual?: boolean` — true для upper-слотов раундов 2+, матч в которых невозможен (одно из поддеревьев-питателей без реальных команд; для round 1 такие позиции слотов не создаются и сейчас). `generate()` дополнительно создаёт матч+игру для каждого upper-слота с `feeders` из двух round-0 bye-ссылок (оба сида известны: n=5/6 → U2p2), команды — `teamBySeed.get(slot.seeds[0/1])`.

- [ ] **Step 1: failing test** — `seedTeams(5)` (и 6): после `generate()` существует матч U2p2 с командами сидов {2, 3}; слоты с `virtual` отсутствуют в рендер-структуре (юнит-проверка `structure(5,0).slots.filter(s => s.stage==='upper' && s.round===2 && s.virtual).length === 1`).
- [ ] **Step 2:** прогнать — FAIL.
- [ ] **Step 3:** реализовать пометку `virtual` в `upperRoundsRest` (оба поддерева считаются тем же помощником реальности из Task 3) и pre-create в `generate()`; в `bracket.js` пропускать `slot.virtual` при построении колонок (десктоп и мобайл).
- [ ] **Step 4:** прогнать — PASS; смоук-тест structure(2..16) на отсутствие крашей.
- [ ] **Step 5:** commit `fix: матчи после двойного bye создаются при генерации, виртуальные слоты не рендерятся`.

### Task 5: историческая сетка архивных 110-турниров

**Files:**
- Create: `src/services/bracket-history.ts`
- Create: `src/public/views/tournament/110/historical.ejs`
- Modify: `src/public/views/tournament/110/index.ejs` (гейт) и `src/routes/web/...` (передать данные — по месту, где сейчас рендерится bracket.ejs; посмотреть, откуда приходит `bracketGenerated`)
- Test: `tests/services/bracket-history.test.ts`

**Interfaces:**
- Produces: `BracketHistory.historical110(tournamentId): { pockets: Array<{ name: string, rounds: Array<Array<HistMatch>> }> }`, где `HistMatch = { id, team_1_id, team_2_id, team_1: {name, city}, team_2: {name, city}, score_1, score_2, finished, winner_id: number | null }`.
- Разбивка на котлы — `team.group_id` (для t2 это C и D, совпадает с компонентами связности матчей); матчи — все строки `match_110` турнира (слоты NULL) по возрастанию id; раунд матча = max(раунды предыдущих матчей команд) + 1 — «две жизни» ложатся в колонки естественно.
- Гейт в index.ejs (внутри system === 1): `bracketGenerated` → bracket.ejs; иначе статус архива (3) и есть завершённые матчи → historical.ejs; иначе — текущая заглушка с кнопкой.

- [ ] **Step 1: failing test** `tests/services/bracket-history.test.ts` — сид: 2 котла (C: 4 команды, D: 3), в каждом цепочка матчей, где победитель встречается повторно; ассерты: 2 кармана с именами C/D; раунды возрастают, матч с обоими «игравшими» участниками в раунде > 1; winner_id по счёту (110 > <110); незавершённый матч — finished=0, winner_id=null.
- [ ] **Step 2:** прогнать — FAIL (файла нет).
- [ ] **Step 3:** реализовать сервис (запрос имён/городов команд — по образцу формирования `bracketTeams` в bracket.ejs / `group.getAll`).
- [ ] **Step 4:** реализовать `historical.ejs` (секции «Котёл X», колонки раундов, классы `tournament-bracket-*`, победитель — `tournament-bracket-team-winner`) и гейт в index.ejs.
- [ ] **Step 5:** прогнать тесты — PASS; смоук в браузере: `/t/2` при override `tournament_system=1` показывает две секции C/D с сыгранными матчами; прогнать полный гейт.
- [ ] **Step 6:** commit `feat: архивные 110-турниры показывают реконструкцию сыгранной сетки по котлам`.

---

## Финал

- Полный гейт: `rm -f .data/test-*.db .data/test.stamp && npm run test`, `npm run typecheck` ≤ 43.
- Смоук `/t/2` в браузере (таб пользователя).
- Вопрос пользователю после выполнения: деплой `npm run release` (только по явному разрешению), доставка правок миграций на прод.
