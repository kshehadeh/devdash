/**
 * Applies all migrations on a fresh temp DB to catch SQL errors before release.
 * Run: bun run migrate-smoke (compiles electron, then runs under Node — Bun cannot load better-sqlite3).
 */
const Database = require("better-sqlite3");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runMigrations } = require("../electron/dist/db/schema");

const id = `devdash-migrate-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const tmp = path.join(os.tmpdir(), `${id}.db`);
const db = new Database(tmp);
try {
  runMigrations(db, tmp);
} finally {
  db.close();
}

const dir = os.tmpdir();
for (const f of fs.readdirSync(dir)) {
  if (f.startsWith(id)) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* ignore */
    }
  }
}
console.log("migrate-smoke: ok");
