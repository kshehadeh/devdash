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
  // v4 — local cache tables for background sync
  `
  CREATE TABLE IF NOT EXISTS sync_log (
    developer_id TEXT NOT NULL,
    data_type TEXT NOT NULL CHECK(data_type IN (
      'github_contributions', 'github_pull_requests',
      'jira_completed_tickets', 'confluence_pages'
    )),
    last_synced_at TEXT NOT NULL,
    last_cursor TEXT,
    status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'error', 'syncing')),
    error_message TEXT,
    PRIMARY KEY (developer_id, data_type),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cached_contributions (
    developer_id TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (developer_id, date),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cached_pull_requests (
    developer_id TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    repo TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('open', 'merged', 'closed')),
    review_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    merged_at TEXT,
    PRIMARY KEY (developer_id, repo, pr_number),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cached_prs_dev_created ON cached_pull_requests(developer_id, created_at);

  CREATE TABLE IF NOT EXISTS cached_completed_tickets (
    developer_id TEXT NOT NULL,
    issue_key TEXT NOT NULL,
    summary TEXT NOT NULL,
    resolved_at TEXT NOT NULL,
    project_key TEXT,
    PRIMARY KEY (developer_id, issue_key),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cached_tickets_dev_resolved ON cached_completed_tickets(developer_id, resolved_at);

  CREATE TABLE IF NOT EXISTS cached_confluence_pages (
    developer_id TEXT NOT NULL,
    page_id TEXT NOT NULL,
    title TEXT NOT NULL,
    space_key TEXT,
    version_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    last_modified TEXT NOT NULL,
    PRIMARY KEY (developer_id, page_id),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cached_confluence_dev_modified ON cached_confluence_pages(developer_id, last_modified);
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
