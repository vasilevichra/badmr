# Системы проведения турнира 110: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать три системы проведения турниров 110 — олимпийскую с доигровками («две жизни»), группы+олимпийку и круговую — поверх уже добавленной настройки `tournament_system`.

**Architecture:** Структура сетки — чистая функция от числа команд и глубины доигровок (`bracket-structure.ts`), одна и та же для сервера и клиента; узел сетки = строка `match_110` с колонками `stage/round/pos`. Матчи создаются лениво: при генерации — только seed-пары, остальные — в момент, когда оба «питателя» слота завершены. Отображение строит клиент из структуры + счётов.

**Tech Stack:** TypeScript (node:sqlite, без сборки), Express 5 + EJS, ванильный JS/jQuery/Bootstrap, собственный тест-раннер.

**Spec:** утверждённые макеты отображения (visual companion, склейки final-merges-v2, `.superpowers/brainstorm/358-*/content`), ответы пользователя:
- глубина доигровок — настройка, по умолчанию полная рекурсия;
- группы+олимпийка: деление по рейтинг-котлам (`team.group_id`), топ-2 из каждого в плей-офф;
- сетка генерируется вручную кнопкой;
- схема сетки — колонки на `match_110`, без таблиц узлов;
- круговая: существующие матрица/плашки без переделок + сводная таблица И/В/П/О.

## Global Constraints

- Все правки SQL — только в существующие миграции `migrations/01-tables-up.sql`, `03-data-up.sql` (новые файлы не создавать).
- Гейт: `rm -f .data/test.stamp && npm run test` — все тесты зелёные (сейчас 496).
- `npm run typecheck`: не хуже базы (44 ошибки; новые — запрещены).
- Комментарии — на русском, объясняют инвариант; идентификаторы camelCase/PascalCase; без кастов `as never` в новом коде.
- Деплой `npm run release` — только по явному разрешению пользователя, вне этого плана.
- Фронт (`src/public/js`, `src/public/css`) тестами не покрывается — проверка typecheck + smoke.
- `migrations/` в `.gitignore`: в коммиты входят только `src/**`, `tests/**`, `README.md`, `package.json` при необходимости.

## Review Focus

1. **Старые турниры** (матчи без `stage`, например «110-1»): матрица, табло и страницы архивов работают как раньше — дерево не рисуется, `/api/matches/110/bracket` отдаёт `generated: false`. Тест: сценарий с матричным матчём без stage в Task 3.
2. **Повторная генерация**: второй клик «Сгенерировать» → 400 и ни одного нового матча. Тест в Task 3.
3. **Нечётное N и bye**: при 12 командах верхние 4 сеяные проходят 1/8 без матча; маршрут создаёт матч следующего раунда с bye-командой, как только её feeder завершён. Тест в Task 2 (структура) и Task 3 (создание).
4. **Исчерпанная глубина доигровок**: при `consolation_depth = 2` команды третьего уровня кармана делят места по посеву без матчей, ни один слот не остаётся без места. Тест в Task 2 (`finalPlaces`).
5. **Прерывание матча на 110-м очке триггером** (04-triggers, RAISE(ABORT) → 500): роутинг сетки не вызывается, повторное очко после коррекции корректно завершает матч и один раз создаёт следующий матч (идемпотентность — защита от двойного создания). Тест в Task 3.

---

### Task 1: Настройка `consolation_depth`

**Files:**
- Modify: `migrations/01-tables-up.sql` (строка 84 — список имён; после строки 99 — CHECK)
- Modify: `migrations/03-data-up.sql:266` (рядом с INSERT id 40)
- Modify: `src/services/settings.ts:52,56,18`
- Modify: `src/public/js/settings.js` (рядом с селектом `tournament_system`, строки 163–168)
- Modify: `tests/services/settings.test.ts`
- Modify: `README.md` (таблица настроек)

**Interfaces:**
- Produces: `settingsService.get('consolation_depth')` → `'0'..'10'` (строка); валидация: целое 0..10, 0 = без ограничения.
- Паттерн для последующих задач: глубина доигровок, число ступеней карманов.

- [ ] **Step 1: Write the failing test** — в `tests/services/settings.test.ts`:
  - существующий тест количества настроек: ожидаемое значение 40 → 41 (и `RELEVANT` для `type = 2` включает `consolation_depth`; `ONLY_110` не показывает её у Новой лиги — существующие тесты relevantOnly уже покрывают, обновить ожидаемые списки);
  - новый тест: `settingsService.set('consolation_depth', '0', tid)` — ok; `'11'` и `'-1'` — ошибка 400 «consolation_depth должен быть целым числом от 0 до 10».

- [ ] **Step 2: Run test to verify it fails** — `rm -f .data/test.stamp && npm run test`; ожидается FAIL по количеству настроек и отсутствию валидации.

- [ ] **Step 3: Implement**
  - `01-tables-up.sql`: в CHECK-список имён (строка 84) добавить `'consolation_depth'`; рядом с CHECK `tournament_system` (строка 99) добавить `CHECK (name <> 'consolation_depth' OR CAST(value AS INTEGER) BETWEEN 0 AND 10)`.
  - `03-data-up.sql`: `(41, 'consolation_depth', '0', 'Глубина доигровок олимпийской сетки (только турниры 110):<br>0 - без ограничения (все места уточняются доигровками),<br>N - максимум N ступеней доигровок (1 - только матч за 3-4, 2 - до мест 5-8, ...)')`.
  - `settings.ts`: `INTEGER_MIN.consolation_depth = 0` + отдельная ветка валидации в `assertValid` (целое 0..10, формат ошибки как у `tournament_system`); добавить `'consolation_depth'` в `RELEVANT[2]` и `ONLY_110`.
  - `settings.js`: селект по образцу `tournament_system` (строки 163–168): опции 0..5, подписи «0 — без ограничения (полная рекурсия)», «1 — 1 ступень», …
  - `README.md`: строка в таблицу настроек рядом с `tournament_system`.

- [ ] **Step 4: Run test to verify it passes** — `rm -f .data/test.stamp && npm run test`; все зелёные.

- [ ] **Step 5: Commit** — `git add src/services/settings.ts src/public/js/settings.js tests/services/settings.test.ts README.md && git commit -m "feat: настройка consolation_depth — глубина доигровок сетки 110"`

### Task 2: Чистая структура сетки

**Files:**
- Create: `src/services/bracket-structure.ts`
- Test: `tests/services/bracket-structure.test.ts`

**Interfaces:**
- Consumes: ничего (чистые функции, без БД).
- Produces (используют Task 3, 4, 5):
```ts
export interface SlotRef { stage: 'upper' | 'lower'; round: number; pos: number; }
export interface BracketSlot extends SlotRef {
  feeders: [SlotRef, SlotRef] | null;  // null — сеяный слот раунда 1
  seeds: [number, number];             // места посева слотов-источников, 0 = «ожидается»
  placeFrom: number; placeTo: number;  // разыгрываемый диапазон мест
}
export interface BracketStructure { size: number; depthLimit: number; slots: BracketSlot[]; }
export const bracketSize = (n: number): number;                 // 12 → 16, 8 → 8, 2 → 2
export const structure = (n: number, depth: number): BracketStructure;
export const targetOf = (s: BracketStructure, from: SlotRef, outcome: 'win' | 'lose'): SlotRef | null;
export const readySlot = (s: BracketStructure, ref: SlotRef, finishedFeeders: (slot: SlotRef) => [number | null, number | null]): [number, number] | null;
```
- Семантика (инварианты в комментариях файла):
  - `structure`: size = степень двойки; посев по стандартной раскладке (слоты 1..size, сид k занимает слот по бит-реверсу; сиды больше n — bye: верхние сиды 1..size-n получают свободное прохождение).
  - Верхний раунд 1: `size/2` матчей, `seeds` = посевы парных слотов (0 у bye-пары), `feeders = null`.
  - Проигравший матча верхнего раунда r попадает в карман уровня 1: диапазон мест `[size/2^r + 1 .. size/2^(r-1)]` (при size=8: 1/4-проигравшие → [5..8], 1/2-проигравшие → [3..4]); победитель финала — место 1, проигравший — 2.
  - Карман на m команд, разыгрывающий места `[lo..lo+m-1]`: при m=2 — один матч (победитель = lo); при m>2 — m/2 матчей, победители → подкарман `[lo..lo+m/2-1]`, проигравшие → подкарман `[lo+m/2..lo+m-1]`; рекурсия.
  - `depth` ограничивает вложенность карманов: `depth=0` — без ограничения; при исчерпанной глубине команды кармана делят его места по посеву (сильнейший сеяный — выше), матчи не создаются.
- `targetOf(..., 'lose')` для lower-матча всегда `null` (выбыл окончательно) — второй жизни у нижней ветки нет, уточнение мест внутри кармана задаётся его собственной структурой.
- `readySlot` возвращает `[team1, team2]` целевого слота, когда оба питателя дали команду (завершённый матч отдаёт победителя/проигравшего, bye-слот — свой сид), иначе `null`.

- [ ] **Step 1: Write the failing tests** (`tests/services/bracket-structure.test.ts`), зашить точные ожидания:
  - `bracketSize(12) === 16`, `bracketSize(8) === 8`, `bracketSize(2) === 2`;
  - `structure(8, 0)`: пары раунда 1 — по раскладке (1-bye? нет: 8 команд, size 8, bye нет): (1v8), (4v5), (3v6), (2v7); placeFrom/placeTo финала `[1..1]`+`[2..2]`, R1 `[5..8]`... для пар: полуфиналы `[3..4]`, четвертьфиналы `[5..8]`; финал placeTo=1, его «карман» проигравшего — [2..2] без матча;
  - `structure(12, 0)`: bye у сидов 1–4; R1-пары (5v12),(6v11),(7v10),(8v9); карман R1-проигравших [9..12]: два матча, победители → матч за 9-10, проигравшие → матч за 11-12;
  - `structure(8, 2) === structure(8, 0)` (глубина не режет); `structure(16, 2)`: в кармане [9..16] есть матчи уровней 1–2 (9-12, 13-16), подкарманы уровня 3 — матчей нет, `finalPlaces` делит по посеву;
  - `targetOf(structure(8,0), {stage:'upper',round:2,pos:1}, 'lose')` → `{stage:'lower', round:2, pos:1}` (матч за 3-4 — lower-карман уровня 1 раунда 2); `'win'` → upper 3/1 (финал).
- [ ] **Step 2: Run test to verify it fails** — `npm run test`; FAIL: модуль не найден.
- [ ] **Step 3: Implement** — рекурсивный обход карманов; тело «bit-reversal посева» и «карман» — по инвариантам выше, остальное выводится из тестов.
- [ ] **Step 4: Run test to verify it passes** — все зелёные.
- [ ] **Step 5: Commit** — `git add src/services/bracket-structure.ts tests/services/bracket-structure.test.ts && git commit -m "feat: чистая структура олимпийской сетки с доигровками"`

### Task 3: Генерация сетки и ленивый роутинг матчей

**Files:**
- Modify: `migrations/01-tables-up.sql` (CREATE TABLE match_110: колонки `stage TEXT CHECK (stage IN ('group','upper','lower'))`, `round INTEGER`, `pos INTEGER` — все NULL-able, комментарий: «NULL — свободная матрица: сетка не генерировалась или круговая система»)
- Modify: `src/repositories/match110.ts` (типизированная строка `Match110Row`, метод `create` получает `slot?: SlotRef`, метод `strengthOrder(tournamentId)`)
- Create: `src/services/bracket.ts` (класс `BracketService`, синглтон)
- Modify: `src/services/game.ts` + `src/repositories/game110.ts` (вызов роутинга при finished=1)
- Modify: `src/services/match.ts` (проброс `generate110`)
- Modify: `src/routes/match.ts` (`POST /generate110`, `GET /bracket110` — см. Task 4; в этой задаче только generate)
- Test: `tests/services/bracket.test.ts`

**Interfaces:**
- Consumes: `structure/targetOf/readySlot` из Task 2; `settingsService.get('consolation_depth' | 'tournament_system')`.
- Produces:
  - `bracketService.generate(tournamentId?: number): Promise<void>` — валидации: турнир идёт (`tournament_status_id = 2`), `tournament_system` ∈ {1,2}, upper-матчей нет (иначе 400 «сетка уже сгенерирована»); для system 2 — вызывается после Task 6 (там же валидация групп). Создаёт seed-матчи раунда 1, где оба слота — сеяные команды (для bye-пар матч не создаётся), каждому — `stage='upper', round=1, pos` и строка `game_110`.
  - `bracketService.onMatchFinished(match110Id: number): void` — читает слот матча, для `targetOf(win)` и `targetOf(lose)` проверяет `readySlot` и создаёт целевой матч (обе команды известны) с теми же stage/round/pos целевого слота + строкой `game_110`; идемпотентно: слот, у которого уже есть матч, не создаётся второй раз.
  - `match110.strengthOrder(tournamentId?: number): {team_id: number}[]` — команды по убыванию силы (среднее рейтингов игроков, как `teamStrength` в `src/repositories/group.ts:74-77`).
  - Интеграция: в `game110.increaseCurrentByTeamIds` после `UPDATE match_110 SET finished = 1` (строка ~189) — `bracketService.onMatchFinished(updated.match_110_id)`.
- Роут: `POST /api/matches/generate110` (`ensureLoggedIn`) → `res.promise(matchService.generate110(requestedTournament(req)))`.

- [ ] **Step 1: Write the failing test** (`tests/services/bracket.test.ts`; сиды команд — через fixture турнира, команды создаются напрямую INSERT в team/user по образцу существующих сидов):
  - `generate` на 8 командах создаёт ровно 4 upper-матча round 1 с парами (1v8),(4v5),(3v6),(2v7), каждому создана строка `game_110`;
  - повторный `generate` → ошибка 400, матчей по-прежнему 4;
  - `generate` на 6 командах: 2 матча R1 + bye у сидов 1–2; доведение feeder-матча до finished (INSERT счёта 110 напрямую в `game_110` + `UPDATE match_110 SET finished=1` — как в существующих тестах game110) вызывает `onMatchFinished`: bye-слот даёт матч раунда 2 сразу после первого feeder; без bye — нет, пока второй feeder не завершён;
  - проигравшие двух feeder'ов R1 (8 команд) дают lower-матч кармана [5..8]; матч за 3-4 создаётся после обоих полуфиналов;
  - матричный матч без stage (старый сценарий, `matchService.create110`) не участвует в роутинге — `onMatchFinished` выходит без действий;
  - `onMatchFinished` на уже сматченном слоте не создаёт дубликат.
- [ ] **Step 2: Run test to verify it fails** — FAIL: `BracketService` не существует.
- [ ] **Step 3: Implement** — по интерфейсам; создание матча: `match110.create(team1, team2)` + `UPDATE match_110 SET stage=?, round=?, pos=? WHERE id=?` + `game110.create(id)`.
- [ ] **Step 4: Run test to verify it passes** — все зелёные.
- [ ] **Step 5: Commit** — `git add src/repositories/match110.ts src/services/bracket.ts src/services/game.ts src/services/match.ts src/repositories/game110.ts src/routes/match.ts tests/services/bracket.test.ts && git commit -m "feat: генерация олимпийской сетки 110 и ленивый роутинг матчей"`

### Task 4: API структуры и сводной таблицы

**Files:**
- Modify: `src/routes/match.ts` (`GET /bracket110`)
- Create: `src/services/standings.ts`
- Modify: `src/repositories/match110.ts` (метод `standingsRows(tournamentId)`: на каждый матч — team_1_id, team_2_id, score_1, score_2, finished, group_id команд)
- Modify: `src/services/match.ts` (проброс `bracket110`, `standings110`)
- Modify: `src/routes/game.ts` (`GET /110/standings`)
- Test: `tests/services/standings.test.ts`, `tests/routes/match.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/matches/bracket110?tournament=<id>` → `{ generated: boolean, system: number, depth: number, structure: BracketStructure | null, matches: Array<{ slot: SlotRef, id, team_1_id, team_2_id, score_1, score_2, finished }> }`; без сгенерированной сетки — `{ generated: false }`.
  - `standingsService.standings(tournamentId?: number, groupId?: number): Array<{ team_id, group_id, games, wins, losses, points, diff }>` — `points = wins`, `diff = сумма (свои очки − чужие) по завершённым матчам`; сортировка: `points` ↓ → личная встреча (при равенстве ровно двух команд, игравших между собой) → `diff` ↓ → сеяние ↑ (`strengthOrder`). Только завершённые матчи.
  - `GET /api/games/110/standings?tournament=<id>&group=<id>` → массив standings.

- [ ] **Step 1: Write the failing tests**:
  - standings: fixture из 3 команд с результатами (A побила B 110:80, B побила C 110:70, A проиграла C 90:110) → порядок A, C, B (по 1 победе у всех... пересчитать: A:1-1 diff +10, C:1-1 diff +40, B:1-1 diff −50 → порядок C, A, B — зашить эти числа; для личной встречи — отдельный кейс двух команд 1-1, победитель личной выше при равном diff);
  - незавершённые матчи не попадают в games/wins;
  - routes: `GET /api/matches/bracket110` без сетки → `{generated:false}`; с сеткой после `generate` → структура и матчи Task 3.
- [ ] **Step 2: Run test to verify it fails**.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run test to verify it passes**.
- [ ] **Step 5: Commit** — `git add ... && git commit -m "feat: API сетки и сводной таблици 110"`

### Task 5: Отображение олимпийки (system 1)

**Files:**
- Create: `src/public/views/tournament/110/bracket.ejs`
- Create: `src/public/js/bracket.js`
- Modify: `src/public/css/index.css`
- Modify: `src/routes/index.ts` (case type 2: если `tournament_system=1` и `generated` — рендер `bracket.ejs` вместо групповой матрицы; структура передаётся в шаблон)

**Interfaces:**
- Consumes: `GET /api/matches/bracket110` (Task 4); структура из ответа API.
- Produces: глобальные `renderBracket(container, data)` (десктоп) и `renderBracketMobile(container, data)` — вызываются из `bracket.ejs` инлайн-скриптом; классы `tournament-bracket-*` в `index.css`.
- Макет (final-merges-v2, экран «олимпийская»):
  - десктоп: колонки раундов слева направо (flex), карточка матча — две строки команд (город — название, счёт справа), верхняя сетка, ниже отдельная секция доигровок с заголовками «Матч за N место»;
  - мобайл: вертикальный список по раундам, доигровки — пунктирной стрелкой с теми же заголовками;
  - идущий матч — кнопка возобновления (как в матрице), завершённый — счёт; пустой слот — «ожидается соперник».

- [ ] **Step 1: Render partial + js по макету** (без юнит-тестов — фронт не тестируется; данные гонять локально на dev-БД с `tournament_system=1`).
- [ ] **Step 2: Verify** — `npm run typecheck` (не хуже 44), `npm run test` (не сломан), визуальная проверка: `npm run compile`, страница `/t/<id>` на десктопной и мобильной ширине (DevTools).
- [ ] **Step 3: Commit** — `git add src/public/views/tournament/110/bracket.ejs src/public/js/bracket.js src/public/css/index.css src/routes/index.ts && git commit -m "feat: отображение олимпийской сетки 110 (дерево + мобильный список)"`

### Task 6: Группы + олимпийка (system 2)

**Files:**
- Modify: `src/repositories/match110.ts` (`create`: при `tournament_system=2` писать `stage='group'`)
- Modify: `src/services/bracket.ts` (`generate` при system 2: участники — топ-2 каждого котла по `standings` котла; посев: 1-е места котлов — верхняя половина, 2-е — нижняя, перемежевание котлов; валидация: все групповые матчи всех котлов завершены, иначе 400 «групповой этап не завершён»)
- Modify: `src/public/views/tournament/110/index.ejs` (лента: блок котлов с матрицами (как есть) + сводная таблица котла + плей-офф `bracket.ejs`)
- Modify: `src/public/js/group.js` (кнопка «Сгенерировать плей-офф», рендер standings)
- Test: `tests/services/bracket.test.ts` (доп. кейсы)

**Interfaces:**
- Consumes: `standings(tournamentId, groupId)` (Task 4), `generate` (Task 3), существующие матрицы.
- Produces: плей-офф system 2 = те же upper/lower-матчи; выбывшие в группах получают место по месту в котле (`standings`), не участвующее в сетке.

- [ ] **Step 1: Write the failing tests**:
  - `stage='group'` у матчей, созданных `matchService.create110` при system 2; при system 1/3 — NULL;
  - `generate` при system 2 до завершения всех групповых → 400; после завершения — сетка на 2×(число котлов) команд, посев: 1-е места котлов не встречаются до финала (тест на 2 котлах по 2 команды: (A1 v B2),(B1 v A2));
- [ ] **Step 2: Run test to verify it fails**.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run test to verify it passes**.
- [ ] **Step 5: Commit** — `git commit -m "feat: группы + олимпийка (system 2): котлы, топ-2, плей-офф"`

### Task 7: Круговая система (system 3)

**Files:**
- Modify: `src/public/views/tournament/110/index.ejs` (под матрицами — сводная таблица)
- Create: `src/public/views/tournament/110/standings.ejs`
- Modify: `src/public/js/group.js` (рендер таблицы И/В/П/О из `/api/games/110/standings` для десктопа; для мобилы — компактная таблица под `buildMobileMatrix`-плашками)

**Interfaces:**
- Consumes: `GET /api/games/110/standings` (Task 4); сортировка уже в API.
- Produces: колонки: Команда | И | В | П | О (О = В); порядок — как отдал API.

- [ ] **Step 1: Implement** (фронт, без юнит-тестов).
- [ ] **Step 2: Verify** — typecheck, тесты, визуально: dev-турнир с `tournament_system=3`, десктоп и мобайл.
- [ ] **Step 3: Commit** — `git commit -m "feat: сводная таблица И/В/П/О для круговой системы 110"`

### Task 8: Финальная проверка

- [ ] `rm -f .data/test.stamp && npm run test` — все зелёные.
- [ ] `npm run typecheck` — не больше 44 ошибок, новые файлы без ошибок.
- [ ] Smoke старого турнира: страница архива «110-1» (system 1 не настроен у него → дефолт 1... проверить: у старых турниров оверрайда нет, берётся дефолт `1` — значит страница архива покажет «сетка не сгенерирована» + матрицу; убедиться визуально, что матрица на месте).
- [ ] Отчёт пользователю; деплой — только по явному разрешению (`npm run release`).
