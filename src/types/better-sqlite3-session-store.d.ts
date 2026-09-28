declare module "better-sqlite3-session-store" {
  import { Store } from "express-session";
  import type { Database } from "better-sqlite3";

  interface Options {
    client: Database;
    expired?: {
      clear?: boolean;
      intervalMs?: number;
    };
  }

  function SqliteStoreFactory(session: any): {
    new (options: Options): Store;
  };

  export default SqliteStoreFactory;
}
