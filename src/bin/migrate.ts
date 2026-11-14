import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbFilePath = process.env.NODE_ENV === "test"
    ? path.resolve(import.meta.dirname, "../../.data/test.db")
    : // BADMR_DATA — корень данных в упакованном Electron-приложении
      process.env.BADMR_DATA
        ? path.join(process.env.BADMR_DATA, ".data/badmr.sqlite3")
        : path.resolve(import.meta.dirname, "../../.data/badmr.sqlite3");
const sqlsDir = path.resolve(import.meta.dirname, "../../migrations");

fs.mkdirSync(path.dirname(dbFilePath), {recursive: true});
const db = new DatabaseSync(dbFilePath, {enableForeignKeyConstraints: false});

db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT NOT NULL PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const applied = new Set(db.prepare("SELECT name FROM _migrations").all().map(r => r.name as string));

/** База, перенесённая со старого db-migrate: таблицы уже есть, а своей
 *  книги миграций у раннера ещё нет — помечаем всё применённым. */
const baselineRow = db.prepare("SELECT count() AS count FROM sqlite_master WHERE type = 'table' AND name = 'state'").get();
const baseline = baselineRow !== undefined && Number(baselineRow.count) > 0 && applied.size === 0;

const migrations = fs.readdirSync(sqlsDir)
    .filter(f => f.endsWith("-up.sql"))
    .sort()
    .map(f => f.replace(/-up\.sql$/, ""));

if (baseline) {
  const insert = db.prepare("INSERT INTO _migrations (name) VALUES (?)");
  for (const name of migrations) {
    insert.run(name);
  }
  console.log(`Baseline: ${migrations.length} миграций уже применены ранее (db-migrate) в ${dbFilePath}`);
} else {
  for (const name of migrations) {
    if (applied.has(name)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(sqlsDir, `${name}-up.sql`), "utf-8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(name);
      db.exec("COMMIT");
      console.log(`Applied: ${name}`);
    } catch (error) {
      db.exec("ROLLBACK");
      console.error(`Failed: ${name}`, error);
      process.exit(1);
    }
  }
}

/** Идемпотентный ensure-ALTER: правки уже применённых миграций на месте
 *  повторно не накатываются (applied → skip), а существующим базам —
 *  включая упакованное Electron-приложение с BADMR_DATA — нужны новые
 *  колонки game_110 (ветка табло 110). ADD COLUMN в SQLite не
 *  идемпотентен — проверяем схему. Для свежих баз колонки приходят из
 *  миграции, блок ничего не делает. */
if (db.prepare("SELECT count() AS count FROM sqlite_master WHERE type = 'table' AND name = 'game_110'").get() !== undefined) {
  const columns = new Set(
      (db.prepare("PRAGMA table_info(game_110)").all() as { name: string }[]).map(c => c.name)
  );
  // типы повторяют 01-tables-up.sql
  const ensure = [
    ["even_1_user_id", "INTEGER NULL"],
    ["even_2_user_id", "INTEGER NULL"],
    ["serve_user_id", "INTEGER NULL"],
    ["game_type_pos", "INTEGER NOT NULL DEFAULT 0"],
  ] as const;
  for (const [name, type] of ensure) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE game_110 ADD COLUMN ${name} ${type}`);
      console.log(`Ensured: game_110.${name}`);
    }
  }
}

db.close();
