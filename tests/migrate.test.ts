import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");

describe("migrate (ensure-ALTER для существующих баз)", () => {
  it("добавляет колонки чётности/подачи в существующую game_110, когда 01-tables уже применена", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "badmr-migrate-"));
    try {
      const dbPath = path.join(dataDir, ".data/badmr.sqlite3");
      fs.mkdirSync(path.dirname(dbPath), {recursive: true});
      const db = new DatabaseSync(dbPath, {enableForeignKeyConstraints: false});
      // база до ветки табло 110: старая схема game_110, все миграции
      // отмечены применёнными — повторно раннер их не накатывает
      const applied = fs.readdirSync(path.join(root, "migrations"))
          .filter(f => f.endsWith("-up.sql"))
          .map(f => f.replace(/-up\.sql$/, ""));
      db.exec(`CREATE TABLE _migrations (
                 name       TEXT NOT NULL PRIMARY KEY,
                 applied_at TEXT NOT NULL DEFAULT (datetime('now'))
               )`);
      const insert = db.prepare("INSERT INTO _migrations (name) VALUES (?)");
      for (const name of applied) insert.run(name);
      db.exec(`CREATE TABLE game_110 (
                 id           INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
                 match_110_id INTEGER  NOT NULL,
                 created_at   DATETIME NOT NULL DEFAULT current_timestamp,
                 game_type_id INTEGER  NOT NULL,
                 score_1      INTEGER  NOT NULL DEFAULT 0,
                 score_2      INTEGER  NOT NULL DEFAULT 0,
                 current      INTEGER  NOT NULL DEFAULT 0
               )`);
      db.close();

      // NODE_ENV=test унаследован от раннера — для migrate он приоритетнее
      // BADMR_DATA; снимаем, чтобы указать изолированную базу
      const {NODE_ENV: _ignored, ...env} = process.env;
      env.BADMR_DATA = dataDir;
      execFileSync(process.execPath, ["--experimental-strip-types", "src/bin/migrate.ts"], {
        cwd: root,
        env,
        stdio: "pipe",
      });

      const after = new DatabaseSync(dbPath, {enableForeignKeyConstraints: false});
      const columns = (after.prepare("PRAGMA table_info(game_110)").all() as { name: string }[]).map(c => c.name);
      after.close();
      for (const col of ["even_1_user_id", "even_2_user_id", "serve_user_id", "game_type_pos"]) {
        assert.ok(columns.includes(col), `нет колонки ${col}, есть: ${columns.join(", ")}`);
      }
    } finally {
      fs.rmSync(dataDir, {recursive: true, force: true});
    }
  });
});
