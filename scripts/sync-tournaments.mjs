#!/usr/bin/env node
/**
 * Перенос турниров prod → dev с последующей регенерацией дампа 05-specific.
 *
 * 1. Скачивает прод-базу с box (scp) во временный файл.
 * 2. Заменяет в dev-базе (.data/badmr.sqlite3) содержимое таблиц из SYNC_TABLES
 *    данными прода (DELETE + INSERT внутри одной транзакции).
 * 3. Выравнивает sqlite_sequence по max(id) перенесённых таблиц.
 * 4. Регенерирует migrations/05-specific-up.sql из dev-базы.
 *
 * Запуск: npm run sync:prod
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..");
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

/** Пароли не уезжают в коммитящийся дамп — как и в текущем 05. */
const NULL_COLUMNS = { user: ["hashed_password", "salt"] };

const log = (m) => console.log(new Date().toISOString(), m);

const tableExists = (db, name) =>
  db.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name=?")
    .get(name).c > 0;

const columns = (db, name) =>
  db.prepare(`PRAGMA table_info("${name}")`).all();

// ── 1. Скачиваем прод-базу ───────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "badmr-sync-"));
const prodDb = path.join(tmp, "prod.sqlite3");
log(`scp ${REMOTE} → ${prodDb}`);
execFileSync("scp", ["-q", REMOTE, prodDb], {stdio: "inherit"});

// ── 2. Перенос таблиц prod → dev ─────────────────────────────────────────────
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
    dev.exec(`INSERT INTO main."${t}" SELECT * FROM sync."${t}";`);
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

// ── 3. Регенерация дампа 05-specific из dev-базы ─────────────────────────────
// таблицы, создаваемые 01-tables, — остальные дамп обязан создать сам
const tables01 = new Set(
    [...fs.readFileSync(path.join(ROOT, "migrations", "01-tables-up.sql"), "utf8")
        .matchAll(/CREATE TABLE "?(\w+)"?/g)].map(m => m[1])
);

const sections = [];
for (const t of DUMP_TABLES) {
  if (!tableExists(dev, t)) continue;
  const cols = columns(dev, t);
  if (cols.length === 0) continue;

  if (!tables01.has(t)) {
    sections.push(dev.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t).sql + ";");
  }

  const colList = cols.map(c => `"${c.name}"`).join(", ");
  const exprs = cols.map((c, i) => {
    const expr = (NULL_COLUMNS[t] ?? []).includes(c.name)
        ? "null"
        : `quote("${c.name}")`;
    return `${expr} AS c${i}`;
  }).join(", ");

  const where = SEEDED_BY_03[t] ? ` WHERE NOT (${SEEDED_BY_03[t]})` : "";
  const rows = dev.prepare(`SELECT ${exprs} FROM "${t}"${where} ORDER BY rowid`)
      .all().map(r => cols.map((_, i) => r[`c${i}`]));
  if (rows.length === 0) continue;

  const values = rows.map(v =>
      `(${v.map(x => x === null ? "null" : x).join(", ")})`).join(",\n       ");
  sections.push(`INSERT INTO ${t} (${colList})\nVALUES ${values};`);
}

const header = `-- Перенос обновлений из живой базы. Регенерируется скриптом
-- .data/sync-tournaments.mjs (перенос prod → dev + дамп), руками не править.
-- Секретные данные (пароли) не выгружаются — их сеет Specific.ts при регистрации.
`;
const tmpDump = DUMP + ".tmp";
fs.writeFileSync(tmpDump, header + sections.join("\n\n") + "\n");
fs.renameSync(tmpDump, DUMP);
log(`дамп регенерирован: ${DUMP} (${sections.length} секций)`);

dev.close();
prod.close();
fs.rmSync(tmp, {recursive: true, force: true});
log("готово");
