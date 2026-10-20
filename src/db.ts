import { DatabaseSync } from "node:sqlite";

export interface RunResult {
  id: number | null;
}

type SqliteParam = string | number | bigint | null | Uint8Array;
type SqliteParams = SqliteParam[] | Record<string, SqliteParam>;

class DB {
  db: DatabaseSync;

  constructor(dbFilePath: string) {
    // FK-ограничения выключены — данные проекта исторически им не удовлетворяют
    // (раньше драйвер sqlite3 по умолчанию их тоже не включал)
    this.db = new DatabaseSync(dbFilePath, { enableForeignKeyConstraints: false });
  }

  /** Выполняет одиночный оператор записи, возвращает lastInsertRowid. */
  run(sql: string, params: SqliteParams = []): RunResult {
    const result = Array.isArray(params)
        ? this.db.prepare(sql).run(...params)
        : this.db.prepare(sql).run(params);
    const id = result.lastInsertRowid;
    return { id: typeof id === "bigint" ? Number(id) : id };
  }

  get<T = Record<string, unknown>>(sql: string, params: SqliteParams = []): T | undefined {
    const row = (Array.isArray(params)
        ? this.db.prepare(sql).get(...params)
        : this.db.prepare(sql).get(params)) as T | undefined;
    // node:sqlite возвращает строки с null-прототипом — приводим к обычным объектам
    return row === undefined ? undefined : {...row};
  }

  all<T = Record<string, unknown>>(sql: string, params: SqliteParams = []): T[] {
    const rows = (Array.isArray(params)
        ? this.db.prepare(sql).all(...params)
        : this.db.prepare(sql).all(params)) as T[];
    return rows.map(row => ({...row}));
  }

  /** Выполняет многостатментный SQL-скрипт (схема, сиды, несколько операторов). */
  exec(sql: string) {
    this.db.exec(sql);
  }

  /** Выполняет набор операторов [sql, ...params] в транзакции,
   *  возвращает результаты каждого оператора. При ошибке — ROLLBACK. */
  transaction(statements: SqliteParam[][]): RunResult[] {
    this.db.exec("BEGIN");
    try {
      const results = statements.map(([sql, ...params]) => this.run(sql as string, params));
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

export default DB;
