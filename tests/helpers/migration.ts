import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const sqlsDir = path.resolve(import.meta.dirname, "../../migrations");

/** Порядок повторяет миграции down(2) + up(2): откатываются и заново
 *  накатываются две последние миграции данных
 *  (05-specific и 06-indexes). */
const resetSqlFiles = [
  "06-indexes-down.sql",
  "05-specific-down.sql",
  "05-specific-up.sql",
  "06-indexes-up.sql",
  // сиды вставляют строки с явными id; без сброса sqlite_sequence
  // автоинкремент продолжает расти между тестами (новый корт — id 46 вместо 14)
  "reset-sequences-for-tests.sql",
].map((file) => fs.readFileSync(path.join(sqlsDir, file), "utf-8"));

/** Делает скрипты повторно безопасными: часть стейтментов могла уже примениться. */
const sanitize = (sql: string) =>
  sql
    .replace(/DROP INDEX (?!IF )/g, "DROP INDEX IF EXISTS ")
    .replace(/CREATE INDEX (?!IF )/g, "CREATE INDEX IF NOT EXISTS ")
    .replace(/DROP TABLE (?!IF )/g, "DROP TABLE IF EXISTS ")
    .replace(/CREATE TABLE (?!IF )/g, "CREATE TABLE IF NOT EXISTS ");

const db = new DatabaseSync(path.resolve(import.meta.dirname, "../../.data/test.db"), { enableForeignKeyConstraints: false });

/** Откатывает и заново накатывает данные и сиды тестовой БД,
 *  не трогая схему таблиц, представлений и триггеров.
 *  Выполняется синхронно одним встроенным соединением node:sqlite:
 *  драйвер sqlite3 (npm) под Node 26 спорадически даёт SQLITE_IOERR,
 *  SQLITE_READONLY и даже порчу файла при таком churn. */
export const clean = (): void => {
  for (const sql of resetSqlFiles) {
    db.exec(sanitize(sql));
  }
};
