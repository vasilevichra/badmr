#!/usr/bin/env node
/**
 * Перенос турниров prod → dev с последующей регенерацией дампа 05-specific.
 *
 * 1. Скачивает прод-базу с box (scp) во временный файл.
 * 2. Заменяет в dev-базе (.data/badmr.sqlite3) содержимое таблиц из SYNC_TABLES
 *    данными прода (DELETE + INSERT внутри одной транзакции).
 * 3. Выравнивает sqlite_sequence по max(id) перенесённых таблиц.
 * 4. Дополняет migrations/05-specific-up.sql из dev-базы: существующие INSERT-ы
 *    сохраняются (строки без изменений — байт в байт, изменённые правятся
 *    на месте, новые дописываются в конец), новые таблицы добавляются секциями.
 *
 * Запуск: npm run sync:prod
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEV_DB = path.join(ROOT, ".data", "badmr.sqlite3");
const DUMP = path.join(ROOT, "migrations", "05-specific-up.sql");
const REMOTE = "box:/home/r/badmr/.data/badmr.sqlite3";

/** Таблицы, переносимые с прода (список владельца проекта).
 *  team_order_110 не переносится: живые данные нарушают CHECK (ms1 != ms2,
 *  ws1 != ws2), с ними дамп перестаёт накатываться на чистую базу. */
const SYNC_TABLES = [
  "user", "user_lab", "tournament", "tournament_settings", "gym",
  "user_club_gym", "court", "group", "user_pic", "user_club",
  "tournament_user", "match", "match_110", "game", "game_100", "game_type",
  "rating", "team_color", "team", "team_user",
];

/** Порядок секций дампа 05-specific: сначала то, что переносится,
 *  затем справочники и 110-данные, которых нет в 03-data. */
const DUMP_TABLES = [
  "unit", "user_club", "gym", "user_club_gym", "tournament",
  "tournament_settings", "tournament_user", "court", "user", "user_pic",
  "user_id_type", "user_id", "user_sizes", "match", "game", "game_100",
  "rating", "team", "team_user", "match_110", "game_110",
  "user_lab",
];

/** Строки, которые сеет 03-data — в дамп 05 не попадают (иначе PK-конфликт). */
const SEEDED_BY_03 = {
  unit: "id = 1",
  user_club: "id = 1",
  gym: "id = 1",
  user_club_gym: "user_club_id = 1 AND gym_id = 1",
  tournament: "id = 1",
  court: "id = 1",
  tournament_settings: "tournament_id = 1",
};
const log = (m) => console.log(new Date().toISOString(), m);

const tableExists = (db, name) =>
  db.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name=?")
    .get(name).c > 0;

const columns = (db, name) =>
  db.prepare(`PRAGMA table_info("${name}")`).all();

// ── 1–2. Скачиваем прод-базу и переносим таблицы prod → dev ──────────────────
const syncProdToDev = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "badmr-sync-"));
  const prodDb = path.join(tmp, "prod.sqlite3");
  log(`scp ${REMOTE} → ${prodDb}`);
  execFileSync("scp", ["-q", REMOTE, prodDb], {stdio: "inherit"});

  // дельты рейтинга округляем до десятых уже в скачанной копии: чистая база
  // несёт CHECK (delta = ROUND(delta, 1)) на rating.delta, а прод до ребилда —
  // нет; грязное значение уронило бы INSERT на шаге 2
  {
    const fix = new DatabaseSync(prodDb);
    fix.exec("UPDATE rating SET delta = ROUND(delta, 1) WHERE delta IS NOT NULL AND delta != ROUND(delta, 1)");
    fix.close();
  }

  const prod = new DatabaseSync(prodDb, {readOnly: true});
  const dev = new DatabaseSync(DEV_DB, {enableForeignKeyConstraints: false});
  dev.exec("PRAGMA busy_timeout = 10000");

  const synced = [], skipped = [];
  dev.exec(`ATTACH '${prodDb.replaceAll("'", "''")}' AS sync`);
  dev.exec("BEGIN");
  try {
    for (const t of SYNC_TABLES) {
      if (!tableExists(prod, t) || !tableExists(dev, t)) {
        skipped.push(t);
        continue;
      }
      dev.exec(`DELETE FROM main."${t}";`);
      // копируем по именам колонок (в порядке dev), а не SELECT *:
      // порядок колонок в прод-базе может отличаться от dev (миграция
      // вставляет новые колонки в середину, ALTER на живой базе — в конец)
      const prodCols = new Set(columns(prod, t).map(c => c.name));
      const shared = columns(dev, t).map(c => c.name).filter(c => prodCols.has(c))
          .map(c => `"${c}"`);
      dev.exec(`INSERT INTO main."${t}" (${shared.join(", ")}) SELECT ${shared.join(", ")} FROM sync."${t}";`);
      synced.push(t);
    }
    // выравниваем счётчики автоинкремента по фактическому max(id)
    for (const t of synced) {
      const hasId = columns(dev, t).some(c => c.pk === 1 && c.name === "id");
      if (!hasId) continue;
      dev.prepare(
          `UPDATE sqlite_sequence
           SET seq = (SELECT coalesce(max("id"), 0) FROM main."${t}")
           WHERE name = '${t}' AND seq < (SELECT coalesce(max("id"), 0) FROM main."${t}")`
      ).run();
    }
    dev.exec("COMMIT");
    dev.exec("DETACH sync");
    log(`синхронизировано: ${synced.join(", ")}`);
    if (skipped.length) log(`пропущены (нет в схеме): ${skipped.join(", ")}`);
  } catch (e) {
    dev.exec("ROLLBACK");
    try { dev.exec("DETACH sync"); } catch {}
    throw e;
  }
  return {prod, dev, tmp};
};

// ── Слияние дампа 05-specific с dev-базой (mergeDump) ────────────────────────
// Дамп не переписывается, а сливается с существующим: неизменённые строки
// остаются байт в байт (минимальный git diff), изменённые правятся на месте,
// новые дописываются в конец INSERT-а своей таблицы («;» → «,»). Удалённые
// из базы строки в дампе не убираются — дамп только растёт. Секция создаётся
// заново только если её нет в дампе или изменился список колонок (схема).
// Ячейки из базы читаются через quote() — они уже готовые SQL-литералы,
// как и кортежи, распарсенные из дампа, — дополнительного квотирования не нужно.

/** Состояние строкового литерала после строки дампа: литералы могут
 *  содержать переводы строк, конец INSERT-а ищем только вне литерала. */
const trackString = (line, inStr) => {
  for (let i = 0; i < line.length; i++) {
    if (inStr) {
      if (line[i] === "'") {
        if (line[i + 1] === "'") i++;
        else inStr = false;
      }
    } else if (line[i] === "'") inStr = true;
  }
  return inStr;
};

/** Кортеж значений "(a, b, c)" → ["a", "b", "c"] (кавычки и вложенные скобки). */
const splitTuple = (s) => {
  const out = [];
  let depth = 0, inStr = false, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (s[i + 1] === "'") cur += s[++i];
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === "(") { depth++; if (depth > 1) cur += ch; continue; }
    if (ch === ")") { depth--; if (depth > 0) cur += ch; continue; }
    if (ch === "," && depth === 1) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
};

/** Сверка литералов без шума: числа, NULL и hex-блобы сравниваем семантически
 *  (регистр hex у quote() и в дампе может различаться). */
const sameLiteral = (a, b) => {
  if (a === b) return true;
  if (/^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b)) return Number(a) === Number(b);
  if (a.toUpperCase() === "NULL" && b.toUpperCase() === "NULL") return true;
  const xa = /^X'([0-9a-fA-F]*)'$/.exec(a), xb = /^X'([0-9a-fA-F]*)'$/.exec(b);
  if (xa && xb) return xa[1].toLowerCase() === xb[1].toLowerCase();
  return false;
};

/** Текст INSERT-а в формате дампа: кортежи с отступом 7 пробелов. */
const insertText = (table, cols, tuples) =>
    `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(", ")})\nVALUES ${tuples.join(",\n       ")};`;/** Кортежи VALUES-блока: тело от «VALUES» до «;» → ["(a, b)", "(c, d)"].
 *  Кортежи хранятся как есть, со скобками (байт в байт с дампом).
 *  Строковые литералы могут содержать переводы строк — учитываются кавычки. */
const parseTuples = (body) => {
  const tuples = [];
  let depth = 0, inStr = false, cur = "";
  for (let k = 0; k < body.length; k++) {
    const ch = body[k];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (body[k + 1] === "'") cur += body[++k];
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === "(") { depth++; if (depth === 1) { cur = "("; continue; } }
    if (ch === ")") { depth--; if (depth === 0) { tuples.push(cur + ")"); cur = ""; continue; } }
    cur += ch;
  }
  return tuples;
};

/** INSERT-высказывания дампа: {table, cols, start, end, tuples},
 *  start/end — диапазон строк (включительно). Остальные строки файла
 *  (комментарии, UPDATE, CREATE TABLE) слиянием не трогаются. */
const parseDump = (text) => {
  const lines = text.split("\n");
  const stmts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^INSERT INTO (\w+) \((.*)\)$/.exec(lines[i]);
    if (!m) continue;
    const cols = m[2].split(",").map(c => c.trim().replaceAll('"', ""));
    let end = -1, inStr = false;
    for (let j = i + 1; j < lines.length; j++) {
      const hasSemi = /;\s*$/.test(lines[j]);
      const body = hasSemi ? lines[j].replace(/;\s*$/, "") : lines[j];
      inStr = trackString(body, inStr);
      if (hasSemi && !inStr) { end = j; break; }
    }
    if (end === -1) break; // незакрытый INSERT — считаем дамп цельным до него
    const body = lines.slice(i + 1, end + 1).join("\n")
        .replace(/^\s*VALUES\s*/i, "").replace(/;\s*$/, "");
    stmts.push({table: m[1], cols, start: i, end, tuples: parseTuples(body)});
    i = end;
  }
  return stmts;
};

/** Слияние dev-базы с существующим дампом. Возвращает {text, notes} —
 *  новый текст дампа и построчные заметки для журнала. */
export const mergeDump = (dev, existingText) => {
  const notes = [];
  const lines = existingText.split("\n");
  const stmts = parseDump(existingText);

  const byTable = new Map();
  for (const s of stmts) {
    if (!byTable.has(s.table)) byTable.set(s.table, []);
    byTable.get(s.table).push(s);
  }

  // таблицы, создаваемые 01-tables, — остальные дамп обязан создать сам
  const tables01 = new Set(
      [...fs.readFileSync(path.join(ROOT, "migrations", "01-tables-up.sql"), "utf8")
          .matchAll(/CREATE TABLE "?(\w+)"?/g)].map(m => m[1])
  );

  const replacements = []; // {start, end, lines}
  const newSections = [];  // секции таблиц, которых в дампе ещё нет

  for (const t of DUMP_TABLES) {
    if (!tableExists(dev, t)) continue;
    const cols = columns(dev, t);
    if (cols.length === 0) continue;
    const colNames = cols.map(c => c.name);
    const exprs = cols.map((c, i) => `quote("${c.name}") AS c${i}`).join(", ");
    const where = SEEDED_BY_03[t] ? ` WHERE NOT (${SEEDED_BY_03[t]})` : "";
    const rows = dev.prepare(`SELECT ${exprs} FROM "${t}"${where} ORDER BY rowid`)
        .all().map(r => cols.map((_, i) => r[`c${i}`]));
    // quote() возвращает готовые SQL-литералы — конкатенируем как есть
    const rowTuple = (row) => `(${row.join(", ")})`;

    const pkIdx = cols.map((c, i) => c.pk > 0 ? i : -1).filter(i => i >= 0)
        .sort((a, b) => cols[a].pk - cols[b].pk);
    const rowsByKey = new Map(pkIdx.length ? rows.map(r => [pkIdx.map(i => r[i]).join("\u0000"), r]) : []);
    const rowKey = (row) => pkIdx.map(i => row[i]).join("\u0000");

    const list = byTable.get(t);
    if (!list) {
      // таблицы нет в дампе — целиком новая секция в конец файла
      if (rows.length === 0) continue;
      if (!tables01.has(t)) {
        newSections.push(dev.prepare(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t).sql + ";");
      }
      newSections.push(insertText(t, colNames, rows.map(rowTuple)));
      notes.push(`${t}: +${rows.length} (новая секция)`);
      continue;
    }

    let added = 0, edited = 0;
    const seen = new Set();
    let drift = false; // схема изменилась — секцию перегенерируем целиком

    for (let si = 0; si < list.length; si++) {
      const s = list[si];
      if (!drift && s.cols.join("\u0000") !== colNames.join("\u0000")) {
        drift = true; // список колонок разошёлся с базой
      }
      if (drift) {
        // перегенерация: все строки базы — в первый INSERT таблицы,
        // остальные её INSERT-ы убираем (их содержимое уже вошло)
        if (si === 0) {
          s.newTuples = rows.map(rowTuple);
          replacements.push({start: s.start, end: s.end,
              lines: [insertText(t, colNames, s.newTuples)]});
          notes.push(`${t}: схема изменилась — секция перегенерирована (${rows.length} строк)`);
        } else {
          replacements.push({start: s.start, end: s.end, lines: []});
        }
        continue;
      }
      // pk-позиции внутри кортежа этого INSERT-а
      const pkPos = pkIdx.map(i => s.cols.indexOf(colNames[i]));
      s.newTuples = s.tuples.map(raw => {
        const values = splitTuple(raw);
        const key = pkPos.map(p => values[p]).join("\u0000");
        const row = rowsByKey.get(key);
        if (!row) return raw; // из базы строка исчезла — в дампе оставляем
        seen.add(key);
        const fresh = rowTuple(row);
        const freshVals = splitTuple(fresh);
        const changed = values.length !== freshVals.length
            || values.some((v, i) => !sameLiteral(v, freshVals[i]));
        if (changed) { edited++; return fresh; }
        return raw;
      });
      replacements.push({start: s.start, end: s.end,
          lines: [insertText(t, s.cols, s.newTuples)]});
    }

    // новые строки — в конец последнего INSERT-а таблицы («;» → «,»)
    const unseen = rows.filter(r => !seen.has(rowKey(r)));
    if (unseen.length && !drift) {
      added = unseen.length;
      const s = list[list.length - 1];
      s.newTuples.push(...unseen.map(rowTuple));
      const rep = replacements.findLast(r => r.start === s.start);
      rep.lines = [insertText(t, s.cols, s.newTuples)];
    }

    notes.push(drift ? `${t}: перегенерировано из-за схемы` : added + edited > 0
        ? `${t}: правок ${edited}, новых +${added}`
        : `${t}: без изменений (${rows.length} строк в базе)`);
  }

  // применяем замены с конца — индексы более ранних не смещаются
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) lines.splice(r.start, r.end - r.start + 1, ...r.lines);

  // новые секции — в конец файла (перед ними пустая строка-разделитель)
  for (const s of newSections) lines.push("", s);

  return {text: lines.join("\n").replace(/\n*$/, "\n"), notes};
};

// ── основной сценарий ────────────────────────────────────────────────────────
// Всё, что трогает дев-базу и дамп, — под guard: модуль импортируется тестами
// ради mergeDump, импорт не должен ни скачивать прод, ни писать дев-базу.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const {prod, dev, tmp} = syncProdToDev();

  // ── 3. Дозаполнение дампа 05-specific из dev-базы ──────────────────────────
  const HEADER = `-- Перенос обновлений из живой базы. Дополняется скриптом
-- src/bin/sync.mjs (перенос prod → dev + слияние с существующим дампом),
-- руками не править.
-- Секретные данные (пароли) не выгружаются — их сеет Specific.ts при регистрации.
`;

  const merged = mergeDump(dev, fs.existsSync(DUMP) ? fs.readFileSync(DUMP, "utf8") : HEADER);
  for (const n of merged.notes) log(n);
  const tmpDump = DUMP + ".tmp";
  fs.writeFileSync(tmpDump, merged.text);
  fs.renameSync(tmpDump, DUMP);
  log(`дамп дополнен: ${DUMP}`);

  dev.close();
  prod.close();
  fs.rmSync(tmp, {recursive: true, force: true});
  log("готово");
}
