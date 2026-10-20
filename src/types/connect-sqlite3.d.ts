// Minimal ambient declaration for connect-sqlite3 (no official @types package)
declare module "connect-sqlite3" {
  import type { Store } from "express-session";

  interface SQLiteStoreOptions {
    db?: string;
    dir?: string;
    table?: string;
    concurrentDB?: boolean;
  }

  class SQLiteStore extends Store {
    constructor(options?: SQLiteStoreOptions);
  }

  export default SQLiteStore;
}
