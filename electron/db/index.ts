import Database from "better-sqlite3";
import path from "path";
import { runMigrations } from "./schema";

let _db: Database.Database | null = null;
let _schedulerStarted = false;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath =
    process.env.DEVDASH_DB_PATH ??
    path.join(process.cwd(), "devdash.db");

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  runMigrations(_db);

  // Lazy-start the sync scheduler on first DB access
  if (!_schedulerStarted) {
    _schedulerStarted = true;
    // Dynamic import to avoid circular deps and keep startup fast
    import("../sync/scheduler").then(({ startSyncScheduler }) => {
      startSyncScheduler();
    }).catch((err) => {
      console.error("[DB] Failed to start sync scheduler:", err);
    });
  }

  return _db;
}
