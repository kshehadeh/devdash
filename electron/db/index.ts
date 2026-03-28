import Database from "better-sqlite3";
import { app, dialog, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { runMigrations } from "./schema";

let _db: Database.Database | null = null;
let _schedulerStarted = false;

export class MigrationFailedError extends Error {
  constructor(public readonly causeErr: unknown) {
    super("Database migration failed");
    this.name = "MigrationFailedError";
  }
}

function getDbPath(): string {
  return process.env.DEVDASH_DB_PATH ?? path.join(process.cwd(), "devdash.db");
}

function backupDatabaseFiles(dbPath: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffixes = ["", "-wal", "-shm"];
  for (const suf of suffixes) {
    const p = suf === "" ? dbPath : `${dbPath}${suf}`;
    if (fs.existsSync(p)) {
      fs.renameSync(p, `${p}.bak.${stamp}`);
    }
  }
}

function openDatabaseAndMigrate(): void {
  const dbPath = getDbPath();
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    try {
      runMigrations(db, dbPath);
    } catch (migrateErr) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      db = null;
      throw new MigrationFailedError(migrateErr);
    }
    _db = db;
    db = null;
  } catch (err) {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
    throw err;
  }

  if (!_schedulerStarted) {
    _schedulerStarted = true;
    Promise.all([
      import("../sync/scheduler").then(({ startSyncScheduler }) => {
        startSyncScheduler();
      }),
      import("../network-monitor").then(({ startNetworkMonitor }) => {
        startNetworkMonitor();
      }),
    ]).catch((e) => {
      console.error("[DB] Failed to start sync scheduler or network monitor:", e);
    });
  }
}

/**
 * Open the database, run migrations, and start the sync scheduler.
 * Call once from the main process after `app.whenReady()`.
 * On failure, shows a dialog with Quit / reset / open folder until success or user quits.
 */
export function ensureDatabaseReady(): void {
  const dbPath = getDbPath();
  const userData = app.getPath("userData");

  for (;;) {
    try {
      openDatabaseAndMigrate();
      return;
    } catch (err) {
      console.error("[DB] Failed to open or migrate:", err);
      const isMigration = err instanceof MigrationFailedError;
      const detail =
        process.env.NODE_ENV === "development"
          ? `${err instanceof Error ? err.message : String(err)}\n${dbPath}`
          : err instanceof Error
            ? err.message
            : String(err);

      const choice = dialog.showMessageBoxSync({
        type: "error",
        title: "DevDash database problem",
        message: isMigration
          ? "DevDash could not upgrade its local database. You can reset it to start fresh (you will need to reconnect accounts)."
          : "DevDash could not open its local database. The data folder may be inaccessible, or the database files may be damaged.",
        detail,
        buttons: ["Quit", "Reset local database", "Open data folder"],
        defaultId: 1,
        cancelId: 0,
      });

      if (choice === 0) {
        app.quit();
        process.exit(1);
      }
      if (choice === 2) {
        shell.openPath(userData);
        continue;
      }

      if (_db) {
        try {
          _db.close();
        } catch {
          /* ignore */
        }
        _db = null;
      }
      _schedulerStarted = false;
      backupDatabaseFiles(dbPath);
    }
  }
}

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error("Database is not initialized; ensureDatabaseReady() must run after app is ready.");
  }
  return _db;
}
