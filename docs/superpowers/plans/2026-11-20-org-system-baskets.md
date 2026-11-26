# Org-system по котлам и корзины группового этапа — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить `tournament_system` и `consolation_depth` на per-котловые `org_system.a–h` (1 — олимпийка с корзинами, 2 — круговая) и `group_residents.a–h` (размер корзины); корзины C1, C2… раскладываются автоматически при добавлении команды; каждая группа рендерится по своей схеме.

**Architecture:** Настройки — те же `defaults`/`tournament_settings` с именами через точку. Корзина — не строка в `"group"`, а номер на команде (`team.basket`, 1-based внутри котла); разбиение пересчитывается идемпотентным `layout()`. Матч получает `match_110.group_id` (уникальность слотов сетки — в рамках котла). Турнирный уровень сеток исчезает: котёл org 1 рисует свою олимпиаду (историческую или сгенерированную), org 2 — круговую матрицу.

**Tech Stack:** Node + TypeScript без сборки (`node --experimental-strip-types`), express 5 + EJS, `node:sqlite`, ванильный JS/jQuery/Bootstrap.

**Spec:** диалог brainstorming 2026-11-20 (решения в конце диалога; ниже зафиксированы в «Решениях спека»).

## Решения спека (фиксируются планом)

- `org_system.<буква>`: `1` — олимпийка с корзинами, `2` — круговая (все со всеми). Код 3 не существует.
- `group_residents.<буква>`: максимальное число команд в одной корзине, целое ≥ 1.
- Корзины существуют только у котла с org 1 и residents > 1 (групповой этап). При residents = 1 (или во всех корзинах по 1 команде) групповой этап не рисуется и не создаётся — это чистая олимпийка: в сетку выходят все команды котла по силе.
- org 1 + residents > 1: команды котла раскладываются по корзинам C1, C2… (имя = имя котла + номер, показывается в UI, в `"group"` строк нет); групповой этап — матрица + таблица каждой корзины; плей-офф котла сеется топ-2 каждой корзины: первые места подряд (сеяния 1..m), затем вторые.
- Раскладка автоматическая: при добавлении команды в котёл — `layout()` (первая корзина со свободным слотом; если все полны — новая корзина max+1). При переключении org на 1 — раскладка всех существующих команд; при переключении на 2 — корзины сбрасываются (basket = NULL).
- `consolation_depth` удалена: доигровки олимпийки всегда с полной рекурсией (глубина 0 в `structure()`).
- Буква котла — из имени группы: только одиночная буква `[a-hA-H]`; группы с именами из нескольких букв (AB, BC, … legacy-сид) считаются круговыми (org 2), корзин для них нет.
- Архив t/2: оверрайды в `05-specific-up.sql` — org 1 и residents 1 для котлов C, D — рендер архива не меняется.
- Рендер: org 2 — текущая матрица; org 1 + групповой этап — секции корзин с матрицами; org 1 без группового этапа — список команд + котёл (сетка). Общего блока сетки под всеми группами больше нет.

## Global Constraints

- Правки SQL — только в существующие миграции `migrations/01-tables-up.sql`, `03-data-up.sql`, `05-specific-up.sql`; новые файлы миграций не создавать.
- **Не коммитить** `migrations/01-tables-up.sql`, `03-data-up.sql`, `04-triggers-up.sql` (там есть незакоммиченные правки пользователя), `.gitignore`, `package.json`, `package-lock.json`, `.idea/workspace.xml`, `*.png`, `iphone-test.mjs`, `docs/superpowers/plans/*`. `05-specific-*` — в gitignore. В коммиты попадают только `src/**`, `tests/**`, `README.md`. Перед финальным коммитом предупредить пользователя, что миграции с изменениями схемы остаются незакоммиченными — решить с ним отдельно.
- Гейт тестов: `rm -f .data/test-*.db .data/test.stamp && npm run test` — все зелёные.
- Гейт типизации: `npm run typecheck` — не больше 43 ошибок (база проекта).
- После остановки — ntfy-уведомление фоном: `curl -s -H "Title: OpenCode: <статус>" -H "Tags: white_check_mark|warning|rotating_light" -d "<итог>" https://ntfy.sh/opencode-c59a69d2 &`.
- После правок `05-specific-up.sql` пользователь должен перезашифровать `etc/ci-seed.enc` (локально `CI_SEED_KEY` отсутствует) — сообщить в финале.
- Комментарии/идентификаторы — на русском; репозитории — синглтоны `static _instance`; запросы — многострочные шаблонные строки с `?`; `db.get/all` типизируются дженериком на месте.

## Review Focus

- Группа с именем не из одной буквы (AB, BC…): ожидание — круговая матрица, без корзин, без сетки. Тест: `basket.test.ts` → «orgSystem для мультибуквенной группы — 2».
- Переключение org на 1 у котла с существующими командами: ожидание — команды раскладаны по корзинам сразу после сохранения настройки. Тест: `basket.test.ts` → «onOrgSystemSet '1' раскладывает существующих».
- Удаление команды оставляет дырку в корзине: следующий `layout()` (при добавлении) уплотняет корзины. Тест: `basket.test.ts` → «layout уплотняет после удаления».
- Архив t/2 без оверрайдов настроек отрендерился бы круговыми матрицами: ожидание — сид в 05-specific pins org 1. Тест: `index.test.ts` → существующие тесты реконструкции t/2 остаются зелёными.
- Матричный матч, созданный до переключения котла в org 1 (stage NULL): ожидание — он не считается матчем группового этапа и не блокирует генерацию сетки; гейт генерации смотрит только stage='group'. Тест: `bracket.test.ts` → «матрица без stage не мешает генерации».

---

### Task 1: Миграции — схема и сид настроек

**Files:**
- Modify: `migrations/01-tables-up.sql` (defaults CHECK — строки 84, 98–101; team — строки 350–360; match_110 — строки 232–259)
- Modify: `migrations/03-data-up.sql` (defaults INSERT — строки 266–267)
- Modify: `migrations/05-specific-up.sql` (секция настроек t/2 после `pocket_structure`)

**Interfaces:**
- Produces (для всех следующих задач): имена настроек `org_system.a`…`org_system.h`, `group_residents.a`…`group_residents.h` (дефолты `'2'` и `'4'`, ids 40–55: `org_system.a`=40 … `org_system.h`=47, `group_residents.a`=48 … `group_residents.h`=55); колонка `team.basket INTEGER NULL`; колонка `match_110.group_id INTEGER NULL REFERENCES "group"`.

- [ ] **Шаг 1: defaults — список имён и CHECK (01-tables)**

В `CREATE TABLE defaults` (строка 84) из CHECK-списка имён удалить `'tournament_system', 'consolation_depth'`, добавить `'org_system.a', 'org_system.b', 'org_system.c', 'org_system.d', 'org_system.e', 'org_system.f', 'org_system.g', 'org_system.h', 'group_residents.a', 'group_residents.b', 'group_residents.c', 'group_residents.d', 'group_residents.e', 'group_residents.f', 'group_residents.g', 'group_residents.h'`.

CHECK-строки 98–101 заменить на:

```sql
    -- схема проведения котла (только 110): 1 - олимпийка с корзинами, 2 - круговая
    CHECK (name NOT GLOB 'org_system.[a-h]' OR CAST(value AS INTEGER) BETWEEN 1 AND 2),
    -- размер корзины группового этапа котла (только 110)
    CHECK (name NOT GLOB 'group_residents.[a-h]' OR CAST(value AS INTEGER) >= 1)
```

- [ ] **Шаг 2: team.basket (01-tables)**

В `CREATE TABLE team` после `team_color_id` добавить:

```sql
    -- номер корзины группового этапа внутри котла (1-based; org_system = 1
    -- и group_residents > 1); NULL — команда вне группового этапа
    basket        INTEGER NULL,
```

- [ ] **Шаг 3: match_110.group_id (01-tables)**

В `CREATE TABLE match_110` добавить колонку и поправить UNIQUE/комментарий:

```sql
    -- котёл матча (группа команды 1); слоты сетки уникальны в рамках котла
    group_id      INTEGER NULL CONSTRAINT match_110_group REFERENCES "group",
```

`UNIQUE (tournament_id, stage, round, pos)` → `UNIQUE (tournament_id, group_id, stage, round, pos)` (для stage NULL/'group' с NULL round/pos NULL-значения в UNIQUE различимы — групповых матчей это не ограничивает). Комментарий над stage дополнить: слот идентифицируется вместе с group_id.

- [ ] **Шаг 4: сид дефолтов (03-data)**

Строки `(40, 'tournament_system', …)` и `(41, 'consolation_depth', …)` в INSERT INTO defaults заменить на 16 строк:

```sql
       (40, 'org_system.a', '2', 'Схема проведения котла A (только турниры 110):<br>1 - олимпийская система с корзинами группового этапа,<br>2 - круговая система (все со всеми)'),
       (41, 'org_system.b', '2', '…аналогично для котла B…'),
       (42, 'org_system.c', '2', '…C…'), (43, 'org_system.d', '2', '…D…'),
       (44, 'org_system.e', '2', '…E…'), (45, 'org_system.f', '2', '…F…'),
       (46, 'org_system.g', '2', '…G…'), (47, 'org_system.h', '2', '…H…'),
       (48, 'group_residents.a', '4', 'Максимальное число команд в корзине группового этапа котла A (только турниры 110).<br>Если команд больше — создаётся следующая корзина (A2, A3, …)'),
       (49, 'group_residents.b', '4', '…B…'), (50, 'group_residents.c', '4', '…C…'),
       (51, 'group_residents.d', '4', '…D…'), (52, 'group_residents.e', '4', '…E…'),
       (53, 'group_residents.f', '4', '…F…'), (54, 'group_residents.g', '4', '…G…'),
       (55, 'group_residents.h', '4', '…H…');
```

(тексты описаний — по этому образцу, на русском, <br> для переносов).

- [ ] **Шаг 5: оверрайды архива t/2 (05-specific)**

В `migrations/05-specific-up.sql` рядом с сидом `pocket_structure` добавить:

```sql
-- котлы t/2 — олимпийка без группового этапа (размер корзины 1):
-- реконструкция сеток архива работает как раньше
INSERT INTO tournament_settings ("id", "defaults_id", "tournament_id", "value")
VALUES (22, 42, 2, '1'),   -- org_system.c
       (23, 43, 2, '1'),   -- org_system.d
       (24, 50, 2, '1'),   -- group_residents.c
       (25, 51, 2, '1');   -- group_residents.d
```

(id tournament_settings проверить на пересечение с уже сидированными id; при коллизии взять следующие свободные).

- [ ] **Шаг 6: пересборка тестовой БД и прогон**

Run: `rm -f .data/test-*.db .data/test.stamp && npm run test 2>&1 | tail -30`
Expected: миграции накатываются; падают только тесты, знающие старые настройки (`tests/services/settings.test.ts` — длина/имена, `tests/services/bracket.test.ts`, `tests/routes/index.test.ts` — tournament_system). Эти падения чинятся в Task 2/4/7.

### Task 2: Сервис настроек — валидация и релевантность

**Files:**
- Modify: `src/services/settings.ts`
- Test: `tests/services/settings.test.ts`

**Interfaces:**
- Produces: `settingsService.get('org_system.c', t)` → `'1'|'2'`; `settingsService.get('group_residents.c', t)` → строка-число ≥ 1. `assertValid` принимает точечные имена. `RELEVANT[2]` и `ONLY_110` содержат 16 точечных имён вместо двух старых.

- [ ] **Шаг 1: failing-тесты**

В `tests/services/settings.test.ts`:
- длину `all.length` 41 → 55 (комментарий про «+ 16 настроек схем и корзин котлов a–h»);
- в тесте ONLY_110-исключений (строка ~122) список заменить: убрать `consolation_depth`, `tournament_system`, добавить `org_system.a` и `group_residents.h` (по одному представителю достаточно, полный список — в тесте RELEVANT);
- describe `consolation_depth` (строки ~136–165) заменить на `org_system` и `group_residents`:
  - `set("org_system.c", "1", 2)` / `"2"` — ок; `"3"`, `"0"`, `"x"` — reject `/org_system/`;
  - `set("group_residents.c", "1", 2)` — ок; `"0"`, `"-1"`, `"1.5"`, `"abc"` — reject `/group_residents/`;
- проверку дефолта (строка ~196): `defaults["org_system.c"] === "2"`, `defaults["group_residents.c"] === "4"`;
- тест RELEVANT для типа 2: список содержит все 16 точечных имён и не содержит `tournament_system`/`consolation_depth`.

- [ ] **Шаг 2: прогон — падение**

Run: `rm -f .data/test-*.db .data/test.stamp && npx tsx tests/services/settings.test.ts 2>&1 | tail -5` (или штатный прогон раннера)
Expected: FAIL — валидация точечных имён не существует.

- [ ] **Шаг 3: реализация (settings.ts)**

- В `assertValid` до блока BOOLEAN добавить две ветки:

```ts
    if (/^org_system\.[a-h]$/.test(name)) {
      // схема котла: 1 - олимпийка с корзинами, 2 - круговая
      if (!['1', '2'].includes(value)) throw Settings.error(`${name} должен быть 1 или 2`);
      return;
    }
    if (/^group_residents\.[a-h]$/.test(name)) {
      // размер корзины: целое >= 1
      if (!/^\d+$/.test(value) || Number(value) < 1) throw Settings.error(`${name} должен быть целым числом не меньше 1`);
      return;
    }
```

- Ветки `tournament_system` и `consolation_depth` удалить.
- `RELEVANT[2]`: вместо `'tournament_system', 'consolation_depth'` — 16 точечных имён.
- `ONLY_110`: аналогично.

- [ ] **Шаг 4: прогон — зелёный**

Run: `rm -f .data/test-*.db .data/test.stamp && npm run test 2>&1 | tail -5`
Expected: settings.test.ts PASS; остальные известные падения (bracket/index) — не блокируют этот шаг, чинятся дальше.

- [ ] **Шаг 5: коммит**

```bash
git add src/services/settings.ts tests/services/settings.test.ts
git commit -m "feat: настройки org_system.a-h и group_residents.a-h вместо tournament_system/consolation_depth"
```

### Task 3: Корзины — раскладка и хуки

**Files:**
- Create: `src/services/basket.ts`
- Modify: `src/repositories/team.ts` (методы корзин), `src/repositories/group.ts` (byName), `src/services/team.ts:16` (хук create), `src/routes/settings.ts` (хук после set)
- Test: `tests/services/basket.test.ts` (создать)

**Interfaces:**
- Consumes: `settingsService.get(name, tournamentId)` (Task 2).
- Produces (используют Task 4–6):
  - `basketService.letter(groupName: string): string | null` — нижняя буква a–h или null;
  - `basketService.groupIdByLetter(letter: string): number | null`;
  - `basketService.orgSystem(tournamentId: number, groupId: number): 1 | 2`;
  - `basketService.residents(tournamentId: number, groupId: number): number`;
  - `basketService.groupStage(tournamentId: number, groupId: number): boolean` — org 1 и residents > 1;
  - `basketService.layout(tournamentId: number, groupId: number): void` — идемпотентная раскладка по `team.id` корзинами по `residents`;
  - `basketService.clear(tournamentId: number, groupId: number): void` — `basket = NULL` всем командам котла;
  - `basketService.onTeamAdded(tournamentId: number, groupId: number): void` — layout при groupStage, иначе no-op;
  - `basketService.onOrgSystemSet(tournamentId: number, name: string, value: string): void` — для `org_system.[a-h]`: '1' → layout котла-буквы, иначе clear; прочие имена — no-op;
  - `basketService.baskets(groupId: number): Map<number, number | null>` — team_id → номер корзины (для фильтрации standings/матриц).

- [ ] **Шаг 1: репозитории**

`src/repositories/team.ts` добавить:

```ts
  /** Команды котла в порядке добавления — вход раскладки корзин. */
  byGroup(group_id: number): { id: number; basket: number | null }[]
  setBasket(team_id: number, basket: number | null): void
```

`src/repositories/group.ts` добавить `byName(name: string): { id: number; name: string } | undefined` (таблица `"group"` глобальная).

- [ ] **Шаг 2: failing-тесты (tests/services/basket.test.ts)**

По образцу существующих сервис-тестов (БД из миграций + fixture; сид команд через helpers). Сценарии:
1. Котёл с 6 командами, `group_residents.<l> = '3'`, `org_system.<l> = '1'` → после `layout()` команды по id: basket 1,1,1,2,2,2.
2. Добавление четвёртой команды при residents=2: `onTeamAdded` → basket 3 у новой, baskets 1,1,2,2 у прочих (layout уплотняет).
3. Удаление средней команды и повторный `layout()` → дырка схлопнулась (1,1,2).
4. `onOrgSystemSet(t, 'org_system.<l>', '2')` → все basket NULL.
5. `orgSystem()` для мультибуквенной группы (AB) → 2; для котла без оверрайда → 2 (дефолт); после `set('org_system.c','1',t)` → 1.
6. `groupStage()`: org 1 + residents 1 → false; org 1 + residents 3 → true; org 2 → false.

- [ ] **Шаг 3: прогон — падение**

Run: `rm -f .data/test-*.db .data/test.stamp && npm run test 2>&1 | grep -A3 basket | head -20`
Expected: FAIL — src/services/basket.ts не существует.

- [ ] **Шаг 4: реализация basket.ts**

Синглтон-сервис по образцу `src/services/settings.ts`; чтение настроек — `settingsService.get`. `layout()`: команды `byGroup` ORDER BY id; `basket = floor(i / residents) + 1`; `setBasket` только тем, у кого значение меняется (дешевле, но можно и всем — идемпотентность обязательна). `letter()`: `/^[a-h]$/i` по имени группы.

- [ ] **Шаг 5: хуки**

- `src/services/team.ts` `create`: после вставки — `basketService.onTeamAdded(tournament_id, group_id)` (добавить поле `basket: number | null` в сигнатуру не нужно — раскладка вычисляет сама).
- `src/routes/settings.ts`: в хендлере сохранения настройки после успешного `settingsService.set(...)` — `await basketService.onOrgSystemSet(tournamentId, name, value)` в том же промисе (res.promise обернуть async-функцией).
- [ ] **Шаг 6: прогон — зелёный**

Run: `rm -f .data/test-*.db .data/test.stamp && npm run test 2>&1 | tail -5`
Expected: basket-тесты PASS, регрессий не добавлено.

- [ ] **Шаг 7: коммит**

```bash
git add src/services/basket.ts src/repositories/team.ts src/repositories/group.ts src/services/team.ts src/routes/settings.ts tests/services/basket.test.ts
git commit -m "feat: корзины группового этапа — раскладка по group_residents при добавлении команды и смене org_system"
```

### Task 4: Сетка по котлам — match_110.group_id и per-pocket bracket

**Files:**
- Modify: `src/repositories/match110.ts`, `src/services/bracket.ts`, `src/services/standings.ts`, `src/routes/match.ts:36-40`
- Test: `tests/services/bracket.test.ts`

**Interfaces:**
- Consumes: `basketService` (Task 3), `structure(teamCount, 0)` из `bracket-structure.ts` (сигнатура не меняется).
- Produces:
  - `match110.create(team_1_id, team_2_id, tournamentId?, slot?)` — сигнатура прежняя; group_id берётся из team_1, stage по умолчанию `'group'` при `groupStage`, иначе NULL;
  - `match110.getBySlot(tournamentId, groupId, slot)`; `hasSlotted(tournamentId, groupId)`; `getAllSlotted(tournamentId, groupId)`; `hasUnfinishedGroup(tournamentId, groupId)`; `strengthOrder(tournamentId?, groupId?)` — все со скоупом котла;
  - `bracketService.generate(tournamentId: number, groupId: number): Promise<void>`; `bracketService.bracket110(tournamentId, groupId)` → `{generated, structure?, matches?}` (полей `system`/`depth` больше нет); `bracketService.onMatchFinished(match110Id)` — прежняя, структура строится по `match.group_id`;
  - `standingsService.standings(tournamentId?, groupId?, basket?)` — третий параметр фильтрует матчи внутри корзины.

- [ ] **Шаг 1: failing-тесты (bracket.test.ts)**

Обновить существующие (заменяют set('tournament_system', …) на set('org_system.<l>', …) и генерацию с groupId) и добавить:
1. Котёл org 1, residents 2, 4 команды → `groupStage` = true; созданные матричные матчи имеют `stage='group'` и `group_id` котла; `generate()` до их завершения → reject `/групповой этап не завершён/`.
2. После завершения групповых матчей `generate(t, groupId)` создаёт плей-офф на 4 участников; сеяние: первые корзин — сиды 1 и 2, вторые — 3 и 4 (первые расходятся по парам R1).
3. Котёл org 1, residents 1 (группового этапа нет): `generate()` сразу сеет все команды по силе (`strengthOrder` внутри котла), матричные матчи имеют stage NULL.
4. Котёл org 2: `generate()` → reject (круговая сетки не имеет).
5. Матрица, созданная до переключения в org 1 (stage NULL), не блокирует генерацию (Review Focus).

- [ ] **Шаг 2: прогон — падение**

Run: `rm -f .data/test-*.db .data/test.stamp && npm run test 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Шаг 3: repositories/match110.ts**

- `Match110Row` + `group_id: number | null`.
- `create`: group_id через подзапрос `(SELECT group_id FROM team WHERE id = ?)` (параметр team_1_id дважды или CTE); stage по умолчанию — из `basketService.groupStage(tournamentId, groupId)` (значение вычислить до INSERT отдельным запросом team.group_id).
- Скоуп котла в `getBySlot/hasSlotted/getAllSlotted/hasUnfinishedGroup` — параметр `groupId`, условие `AND group_id = ?`.
- `strengthOrder(tournamentId?, groupId?)` — опциональный фильтр `AND t.group_id = ?`.
- Обновить всех вызывающих (grep по `hasSlotted\|getAllSlotted\|getBySlot\|hasUnfinishedGroup`).

- [ ] **Шаг 4: services/bracket.ts и standings.ts**

- `participants(tournamentId, groupId)`: `basketService.groupStage` → по корзинам `basketService.baskets(groupId)` (номера 1..max): `standingsService.standings(tournamentId, groupId, n).slice(0, 2)` → firsts/seconds; иначе `match110.strengthOrder(tournamentId, groupId)`.
- `buildStructure(tournamentId, groupId)`: `structure(this.participants(id, groupId).length, 0)` — чтение `consolation_depth` удалить.
- `generate(tournamentId?, groupId?)`: groupId обязателен; гейты: статус 2; `orgSystem === 1` (иначе badRequest «круговая система сетки не имеет»); `!hasSlotted(id, groupId)`; при groupStage — `!hasUnfinishedGroup(id, groupId)` и `participants >= 2`.
- `onMatchFinished`: структура — `buildStructure(match.tournament_id, match.group_id!)`.
- `bracket110(tournamentId?, groupId)`: скоуп по котлу; из payload убрать `system` и `depth`.
- `standings.ts`: третий параметр `basket?: number` — фильтр строк: обе команды имеют этот номер корзины (номера из `basketService.baskets(groupId)`; матч учитывается, если basket(team_1) === basket(team_2) === basket).

- [ ] **Шаг 5: routes/match.ts**

- `POST /generate110`: принимать `group_id` (body или query) — `bracketService.generate(requestedTournament(req), Number(req.body?.group_id ?? req.query.group))`.
- `GET /bracket110`: прокинуть параметр `group` в `bracket110(tournament, group)`.

- [ ] **Шаг 6: прогон — зелёный**

Run: `rm -f .data/test-*.db .data/test.stamp && npm run test 2>&1 | tail -5`
Expected: bracket-тесты PASS; из известных падающих остаётся только `tests/routes/index.test.ts` (рендер, Task 7).

- [ ] **Шаг 7: коммит**

```bash
git add src/repositories/match110.ts src/services/bracket.ts src/services/standings.ts src/routes/match.ts tests/services/bracket.test.ts
git commit -m "feat: олимпийская сетка на уровне котла — слоты с group_id, плей-офф от топ-2 корзин, удаление consolation_depth"
```

### Task 5: UI настроек (settings.js)

**Files:**
- Modify: `src/public/js/settings.js` (форматтеры строк ~168–190)

**Interfaces:**
- Consumes: строки настроек `org_system.*` / `group_residents.*` из `getAll` (Task 2).
- Produces: селект org (1/2) и числовой ввод residents, сохранение общим change-механизмом таблицы.

- [ ] **Шаг 1: форматтеры**

- Удалить ветки `tournament_system` и `consolation_depth`.
- `org_system.*`: селект по образцу старого `tournament_system`, варианты `{1: 'Олимпийская (с корзинами)', 2: 'Круговая (все со всеми)'}`, `data-name="${row.name}"`, класс `settings-reference-select`.
- `group_residents.*`: `<input type="number" min="1" class="settings-number-input form-control form-control-sm text-center" data-name="${row.name}" value="${value}"/>`; сохранение — тот же change-хендлер, что у чекбоксов/селектов (проверить, что хендлер читает `data-name` и value; при необходимости обобщить на input).
- [ ] **Шаг 2: ручная проверка**

Run: dev-сервер (`lsof -ti tcp:3000 | xargs kill; nohup npm run compile > .log/dev-server.log 2>&1 < /dev/null & disown`), страница настроек турнира 110: 16 новых строк редактируются, значение persists после F5.
- [ ] **Шаг 3: коммит**

```bash
git add src/public/js/settings.js
git commit -m "feat: UI настроек — селекты org_system.a-h и вводы group_residents.a-h"
```

### Task 6: Рендер по схеме котла (index/group/pocket, bracket.ejs уходит)

**Files:**
- Modify: `src/routes/index.ts:170-210`, `src/public/views/tournament/110/index.ejs`, `src/public/views/tournament/110/group.ejs`, `src/public/views/tournament/110/pocket.ejs`, `src/public/js/bracket.js`
- Delete: `src/public/views/tournament/110/bracket.ejs` (полезное — перенести в pocket.ejs)

**Interfaces:**
- Consumes: `basketService.orgSystem/groupStage`, `bracketService.bracket110(t, groupId)` (Task 3–4), `bracketHistoryService.historical110` (без изменений).
- Produces: данные рендера для группы: `org` (1|2), `groupStage` (boolean), `pocket` (исторический котёл или null), per-pocket хост клиентского рендера `tournament-bracket-pocket-<groupId>`.

- [ ] **Шаг 1: routes/index.ts**

- Убрать `tournamentSystem`, `bracketGenerated`, общий `bracketLive`.
- Для каждой группы из `groups` вычислить `groupId` и передать map: `orgByGroup[group_id] = basketService.orgSystem(t.id, groupId)`, `stageByGroup[group_id] = basketService.groupStage(t.id, groupId)`.
- `bracketHistorical` оставить (реконструкция по котлам), но фильтровать котлы: `pockets.filter(p => orgByGroup[p.group_id] === 1)`.
- [ ] **Шаг 2: index.ejs**

- В цикле групп передавать в group.ejs `org`, `groupStage`, `pocket`.
- Блок сетки уровня турнира (строки 41–46) удалить — сетка теперь внутри group/pocket.

- [ ] **Шаг 3: group.ejs**

- org 2 (или мультибуквенная группа): текущая матрица без изменений.
- org 1 + groupStage: над матрицей — секции корзин: заголовок «C1», «C2»… и для каждой своя матрица+таблица (таблица — standings, отфильтрованный по корзине; матрицу вынести во фрагмент-include, принимающий список команд корзины).
- org 1 + !groupStage: матрицу не рисовать; include pocket.ejs.

- [ ] **Шаг 4: pocket.ejs**

Объединить исторический и сгенерированный рендер:
- исторический `pocket` — как сейчас (серверный рендер реконструкции);
- иначе если org 1: хост `<div id="tournament-bracket-pocket-<%= groupId %>" class="tournament-bracket-pocket">`; если сетка сгенерирована — клиентский рендер: fetch `/api/matches/bracket110?tournament=<id>&group=<groupId>` → `renderBracket`/`renderBracketMobile` (bracket.js); модалки табло живых матчей котла (аналог bracketLive из bracket.ejs);
- иначе если user и турнир идёт и сетка не сгенерирована — кнопка «Сгенерировать сетку» с `data-group="<groupId>"`, POST `/api/matches/generate110` c group_id (скрипт из bracket.ejs перенести сюда).

- [ ] **Шаг 5: bracket.js**

- Хендлер кнопки генерации — по `data-group`; проверить использование `data.system`/`data.depth` в рендере — убрать, если есть.

- [ ] **Шаг 6: ручная проверка вживую**

Run: dev-сервер перезапустить; t/2 (`http://localhost:3000/t/2`): котлы C, D рисуются как раньше (реконструкция, байи, места); текущий турнир: у котла org 1 + residents 2 — секции корзин и после генерации сетка под составами; org 2 — матрица.
- [ ] **Шаг 7: коммит**

```bash
git add src/routes/index.ts src/public/views/tournament/110/index.ejs src/public/views/tournament/110/group.ejs src/public/views/tournament/110/pocket.ejs src/public/js/bracket.js
git rm src/public/views/tournament/110/bracket.ejs 2>/dev/null; git commit -m "feat: рендер групп по своей схеме проведения — корзины, per-pocket сетка, отказ от общей сетки турнира"
```

### Task 7: Роут-тесты, README, финальные гейты

**Files:**
- Modify: `tests/routes/index.test.ts`, `README.md` (таблица настроек, строки 55–56 и связанные упоминания систем)

- [ ] **Шаг 1: роут-тесты**

- Строку 179 `set('tournament_system', '2', 2)` заменить на оверрайды org 2 для котлов t/2 (`org_system.c`, `org_system.d`).
- Тесты реконструкции t/2 не менять (должны остаться зелёными на сиде Task 1).
- Добавить тест: текущий турнир, котёл org 1 + residents 1, сетка не сгенерирована, статус «идёт» → в HTML есть `bracket-generate` с `data-group`; архив — нет.

- [ ] **Шаг 2: README**

- Таблицу настроек: удалить строки `tournament_system`, `consolation_depth`; добавить 16 строк (org_system.a–h дефолт 2, group_residents.a–h дефолт 4) с описаниями из сидов.
- Упоминания «системы 1/2/3» в текстах README привести к новой схеме (1 — олимпийка с корзинами, 2 — круговая).

- [ ] **Шаг 3: финальные гейты**

Run: `rm -f .data/test-*.db .data/test.stamp && npm run test 2>&1 | tail -5 && npm run typecheck 2>&1 | grep -c "error TS"`
Expected: все тесты зелёные; ошибок typecheck ≤ 43.

- [ ] **Шаг 4: коммит**

```bash
git add tests/routes/index.test.ts README.md
git commit -m "docs+test: роут-тесты и README под org_system/group_residents"
```

- [ ] **Шаг 5: отчёт пользователю**

- Напомнить: перезашифровать `etc/ci-seed.enc` (в сид добавлены оверрайды настроек t/2) — локального `CI_SEED_KEY` нет.
- Напомнить: миграции 01/03 (и 05 в gitignore) не закоммичены по правилу — решить вместе, как включить в коммит.
- ntfy-уведомление фоном.
