import assert from "node:assert/strict";
import { describe, beforeEach, it } from "node:test";

import DB from "../src/db.ts";

describe("DB", () => {
  let db: DB;

  beforeEach(() => {
    db = new DB(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)");
  });

  describe("transaction", () => {
    it("должен выполнить все операторы и закоммитить", () => {
      const results = db.transaction([
        ["INSERT INTO t (v) VALUES (?)", "a"],
        ["INSERT INTO t (v) VALUES (?)", "b"],
      ]);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(db.get<{ c: number }>("SELECT count() AS c FROM t")!.c, 2);
    });

    it("должен откатить всё при ошибке одного оператора", () => {
      assert.throws(() =>
        db.transaction([
          ["INSERT INTO t (v) VALUES (?)", "a"],
          ["INSERT INTO missing_table (v) VALUES (?)", "b"],
        ]),
      );

      // ROLLBACK: первая вставка не сохранилась
      assert.strictEqual(db.get<{ c: number }>("SELECT count() AS c FROM t")!.c, 0);
    });
  });

  describe("exec", () => {
    it("должен выполнить многостатементный скрипт", () => {
      db.exec("CREATE TABLE u (id INTEGER); INSERT INTO u VALUES (1); INSERT INTO u VALUES (2);");

      assert.strictEqual(db.get<{ c: number }>("SELECT count() AS c FROM u")!.c, 2);
    });
  });

  describe("close", () => {
    it("должен закрыть соединение", () => {
      db.close();

      assert.throws(() => db.get("SELECT 1"));
    });
  });
});
