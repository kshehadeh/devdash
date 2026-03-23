import * as fs from "fs";
import type Database from "better-sqlite3";

/** Migrations that rebuild large tables — backup DB file before applying. */
const MIGRATION_INDICES_WITH_FULL_BACKUP = new Set([5, 10]);

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
  // v5 — broaden Jira cache to all ticket statuses; relax sync_log data_type constraint
  `
  -- Recreate sync_log without the restrictive data_type CHECK so new types can be added freely
  ALTER TABLE sync_log RENAME TO sync_log_old;

  CREATE TABLE sync_log (
    developer_id TEXT NOT NULL,
    data_type TEXT NOT NULL,
    last_synced_at TEXT NOT NULL,
    last_cursor TEXT,
    status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'error', 'syncing')),
    error_message TEXT,
    PRIMARY KEY (developer_id, data_type),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );

  INSERT OR IGNORE INTO sync_log SELECT * FROM sync_log_old WHERE data_type NOT IN ('jira_completed_tickets');
  DROP TABLE sync_log_old;

  -- New table: all assigned Jira tickets regardless of status
  CREATE TABLE IF NOT EXISTS cached_jira_tickets (
    developer_id TEXT NOT NULL,
    issue_key TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '',
    status_category TEXT NOT NULL DEFAULT 'todo',
    project_key TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (developer_id, issue_key),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cached_jira_tickets_dev ON cached_jira_tickets(developer_id, updated_at);

  -- Migrate existing completed tickets into the new table
  INSERT OR IGNORE INTO cached_jira_tickets
    (developer_id, issue_key, summary, status, status_category, project_key, updated_at)
  SELECT developer_id, issue_key, summary, 'Done', 'done', project_key, resolved_at
  FROM cached_completed_tickets;
  `,
  // v6 — add priority and issue_type columns to cached_jira_tickets
  `
  ALTER TABLE cached_jira_tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
  ALTER TABLE cached_jira_tickets ADD COLUMN issue_type TEXT NOT NULL DEFAULT 'Task';
  `,
  // v7 — review queue cache + PR review signals on cached_pull_requests
  `
  ALTER TABLE cached_pull_requests ADD COLUMN latest_review_state TEXT;
  ALTER TABLE cached_pull_requests ADD COLUMN pending_reviewers_json TEXT NOT NULL DEFAULT '[]';

  CREATE TABLE IF NOT EXISTS cached_review_requests (
    developer_id TEXT NOT NULL,
    repo TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    author_login TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (developer_id, repo, pr_number),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cached_review_req_dev ON cached_review_requests(developer_id);
  `,
  // v8 — per-category integration provider selection
  `
  CREATE TABLE IF NOT EXISTS integration_settings (
    category TEXT NOT NULL PRIMARY KEY CHECK (category IN ('code', 'work', 'docs')),
    provider_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO integration_settings (category, provider_id) VALUES
    ('code', 'github'),
    ('work', 'jira'),
    ('docs', 'confluence');
  `,
  // v9 — developer identity per category (JSON payload); backfill from legacy columns
  `
  CREATE TABLE IF NOT EXISTS developer_integration_identity (
    developer_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('code', 'work', 'docs')),
    provider_id TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (developer_id, category),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );
  INSERT OR IGNORE INTO developer_integration_identity (developer_id, category, provider_id, payload_json)
    SELECT id, 'code', 'github',
      CASE WHEN github_username IS NOT NULL AND github_username != ''
        THEN json_object('githubUsername', github_username) ELSE '{}' END
    FROM developers;
  INSERT OR IGNORE INTO developer_integration_identity (developer_id, category, provider_id, payload_json)
    SELECT id, 'work', 'jira',
      CASE WHEN atlassian_email IS NOT NULL AND atlassian_email != ''
        THEN json_object('workEmail', atlassian_email) ELSE '{}' END
    FROM developers;
  INSERT OR IGNORE INTO developer_integration_identity (developer_id, category, provider_id, payload_json)
    SELECT id, 'docs', 'confluence',
      CASE WHEN atlassian_email IS NOT NULL AND atlassian_email != ''
        THEN json_object('atlassianEmail', atlassian_email) ELSE '{}' END
    FROM developers;
  `,
  // v10 — data_sources: add provider_id, drop restrictive type CHECK (table rebuild)
  `
  PRAGMA foreign_keys = OFF;
  CREATE TABLE data_sources_new (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    provider_id TEXT,
    name TEXT NOT NULL,
    org TEXT NOT NULL DEFAULT '',
    identifier TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO data_sources_new (id, type, provider_id, name, org, identifier, metadata, created_at, updated_at)
    SELECT id, type,
      CASE type
        WHEN 'github_repo' THEN 'github'
        WHEN 'jira_project' THEN 'jira'
        WHEN 'confluence_space' THEN 'confluence'
        ELSE NULL
      END,
      name, org, identifier, metadata, created_at, updated_at
    FROM data_sources;
  DROP TABLE data_sources;
  ALTER TABLE data_sources_new RENAME TO data_sources;
  PRAGMA foreign_keys = ON;
  `,
  // v11 — Linear issue cache
  `
  CREATE TABLE IF NOT EXISTS cached_linear_issues (
    developer_id TEXT NOT NULL,
    issue_id TEXT NOT NULL,
    identifier TEXT NOT NULL,
    title TEXT NOT NULL,
    state_name TEXT NOT NULL DEFAULT '',
    state_type TEXT NOT NULL DEFAULT 'unstarted',
    team_key TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (developer_id, issue_id),
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_cached_linear_dev_updated ON cached_linear_issues(developer_id, updated_at);
  `,
  // v12 — Linear team id for source filtering
  `
  ALTER TABLE cached_linear_issues ADD COLUMN team_id TEXT;
  `,
];



export function runMigrations(db: Database.Database, dbFilePath?: string) {
  // Ensure schema_version table exists before querying it
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const versionRow = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  const current = versionRow?.version ?? -1;

  for (let i = current + 1; i < MIGRATIONS.length; i++) {
    if (dbFilePath && MIGRATION_INDICES_WITH_FULL_BACKUP.has(i)) {
      fs.copyFileSync(dbFilePath, `${dbFilePath}.pre-migration-${i}.bak`);
    }
    // Wrap migration + version bump in a transaction (DDL may still autocommit on some SQLite builds; backups cover risky steps).
    const apply = db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.prepare("UPDATE schema_version SET version = ?").run(i);
    });
    apply();
  }
}
