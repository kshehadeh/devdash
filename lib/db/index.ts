import Database from "better-sqlite3";
import path from "path";
import { runMigrations } from "./schema";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath =
    process.env.DEVDASH_DB_PATH ??
    path.join(process.cwd(), "devdash.db");

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  runMigrations(_db);

  return _db;
}
