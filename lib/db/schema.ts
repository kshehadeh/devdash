import type Database from "better-sqlite3";

export const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS developers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    role TEXT NOT NULL,
    team TEXT NOT NULL,
    github_username TEXT,
    atlassian_email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    encrypted_token TEXT,
    email TEXT,
    org TEXT,
    connected INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  INSERT OR IGNORE INTO schema_version (version) VALUES (0);
  `,
  // v2 — remove sample developers
  `
  DELETE FROM developers WHERE id IN ('dev-1', 'dev-2', 'dev-3', 'dev-4');
  `,
  // v3 — global data sources and per-developer associations
  `
  CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('github_repo', 'jira_project', 'confluence_space')),
    name TEXT NOT NULL,
    org TEXT NOT NULL DEFAULT '',
    identifier TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS developer_sources (
    developer_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    PRIMARY KEY (developer_id, source_id),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
  );
  `,
];



export function runMigrations(db: Database.Database) {
  // Ensure schema_version table exists before querying it
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const versionRow = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  const current = versionRow?.version ?? -1;

  for (let i = current + 1; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]);
    db.prepare("UPDATE schema_version SET version = ?").run(i);
  }


}
