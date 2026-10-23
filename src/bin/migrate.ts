import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbFilePath = process.env.NODE_ENV === "test"
    ? path.resolve(import.meta.dirname, "../../.data/test.db")
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

db.close();
