# DevDash database guide

This document explains how DevDash uses SQLite locally: where the database file lives, how startup and migrations work, what the schema contains at a high level, and how failure recovery is handled.

## What DevDash stores in SQLite

DevDash uses a local SQLite database (via `better-sqlite3`) as the app's persistent state and offline cache.

At a high level, it stores:

- App entities (`developers`, settings, selected integrations)
- Connection metadata for providers (`connections`) including encrypted token material
- Source configuration (`data_sources`, `developer_sources`)
- Sync state (`sync_log`)
- Provider cache tables for dashboard/reporting reads (GitHub, Jira, Confluence, Linear)
- Integration notifications and preferences (`notifications`, `notification_preferences`)
- Schema migration version (`schema_version`)

The renderer process never talks to SQLite directly. Database access lives in the Electron main process through DB modules in `electron/db/` and IPC handlers in `electron/ipc/`.

## Local database file location

Database path is set in `electron/boot-env.ts` using `DEVDASH_DB_PATH`:

- Development: `<repo>/devdash.db` (current working directory)
- Production/installed app: `<userData>/devdash.db`, where `userData` comes from Electron `app.getPath("userData")`

On macOS, this usually resolves to:

`~/Library/Application Support/DevDash/devdash.db`

Associated SQLite WAL files may also exist alongside it:

- `devdash.db-wal`
- `devdash.db-shm`

## Startup lifecycle

When the app is ready, `electron/main.ts` calls:

`ensureDatabaseReady()` (from `electron/db/index.ts`)

That function:

1. Opens the DB file.
2. Applies SQLite pragmas (`journal_mode = WAL`, `foreign_keys = ON`).
3. Runs schema migrations (`runMigrations`).
4. Makes the DB singleton available via `getDb()`.
5. Starts the background sync scheduler.

Any DB open or migration failure is handled before the UI fully initializes.

## How migrations work

Migrations are defined as an ordered SQL array in `electron/db/schema.ts`:

- `MIGRATIONS: string[]` where index = schema version
- `schema_version` table stores the last applied migration index
- On startup, `runMigrations()` reads current version and applies all pending migrations in order

Migration algorithm:

1. Ensure `schema_version` table exists.
2. Read current version (defaults to `-1` if missing).
3. For each migration `i` from `current + 1` to latest:
   - Optionally create a full DB backup for risky migrations.
   - Execute migration SQL.
   - Update `schema_version.version = i`.

Each migration execution + version bump is wrapped in a transaction (`db.transaction(...)`), with file-level backups used as extra safety for table rebuild migrations.

### Backup behavior during migrations

There are two backup mechanisms:

1. **Pre-migration full copy backups for selected migration indices**  
   Controlled by `MIGRATION_INDICES_WITH_FULL_BACKUP` in `schema.ts` (currently includes index `5` and `10`).  
   Backup filename pattern:

   - `devdash.db.pre-migration-<index>.bak`

2. **Failure/reset backups when open or migration fails**  
   In `ensureDatabaseReady()`, if recovery action is chosen, the DB and WAL companions are renamed with timestamp:

   - `devdash.db.bak.<timestamp>`
   - `devdash.db-wal.bak.<timestamp>`
   - `devdash.db-shm.bak.<timestamp>`

This preserves old data for manual inspection/recovery while allowing the app to recreate a clean database.

## Upgrade path for already-installed apps

For users who already have DevDash data from an older version:

1. App updates (manual install or auto-update flow).
2. On next launch, `ensureDatabaseReady()` runs.
3. Pending migrations apply in place, sequentially.
4. Existing rows are preserved/transformed by migration SQL where needed.
5. `schema_version` is advanced to the latest migration index.

No separate "migration command" is required in production; startup is the migration trigger.

## High-level schema structure

Current schema evolves over migrations, but conceptually it is grouped as:

### Core app and configuration

- `developers`: tracked people and identity fields
- `config`: app-level string settings (key/value). The renderer may only read/write keys allow-listed in [`electron/ipc/app-config.ts`](../electron/ipc/app-config.ts):

  | Key | Purpose |
  |-----|---------|
  | `onboarding_completed` | `"1"` when first-run onboarding finished |
  | `auto_update_enabled` | Auto-update preference |
  | `notifications_enabled` | Master switch for integration notification polling |
  | `notifications_poll_interval_ms` | Poll interval for notification service |
  | `pr_stale_warn_days` | Integer — authored open PR with zero reviews: warn tier age (days from last update); used by `github_stale_pr` notifications and dashboard PR list styling |
  | `pr_stale_danger_days` | Integer — same, danger tier |
  | `dashboard_widget_layout_json` | JSON array of dashboard widget ids (order + visibility); see [`features.md`](./features.md) |

- `integration_settings`: selected provider per category (`code`, `work`, `docs`)
- `developer_integration_identity`: per-developer/category identity payloads

### Connections and source mapping

- `connections`: provider connection records and encrypted credentials
- `data_sources`: global provider sources (repo/project/space/team style entities)
- `developer_sources`: many-to-many developer-to-source assignments

### Sync bookkeeping

- `sync_log`: per developer and data type sync cursor, status, and errors. In addition to the standard integration data types (e.g. `jira_tickets`), this table also stores a `jira_reconcile` entry per developer that tracks when the last daily reconciliation ran (via `last_cursor = YYYY-MM-DD`).

### Provider cache tables

- GitHub: `cached_contributions`, `cached_pull_requests` (includes `first_review_submitted_at` as of migration **v20**), `cached_review_requests`, `cached_pr_review_comments`, `cached_pr_comments_received` (migration **v21**), `cached_pr_approvals_given` (**v21**)
- Jira: `cached_jira_tickets` — stale/deleted tickets are removed by two mechanisms: (1) a daily reconciliation pass (`reconcileJiraTickets` in `electron/sync/atlassian-sync.ts`) that diffs live Jira issue keys against the cache and deletes any that no longer exist; and (2) on-demand validation triggered when a user clicks a ticket link (`jira:ticket:validate` IPC handler in `electron/ipc/reference.ts`), which calls the Jira single-issue endpoint and removes the row immediately if it returns 404.
- Confluence: `cached_confluence_pages`
- Linear: `cached_linear_issues`

### Notification tables

- `notifications`: concrete delivered integration events with status (`new`, `read`)
- `notification_preferences`: per integration/type enablement and strategy metadata

### Migration metadata

- `schema_version`: single-row table tracking the latest applied migration index

## Failure handling and user experience

If DB open/migration fails at startup, DevDash presents a blocking error dialog with options:

- Quit
- Reset local database
- Open data folder

Choosing reset preserves prior files as timestamped backups and retries startup with a new DB.

## Developer workflow and validation

For local/dev safety, the project includes a migration smoke test:

- Script: `scripts/migrate-smoke.cjs`
- Command: `bun run migrate-smoke`

This compiles Electron DB code and runs all migrations against a fresh temporary DB to catch SQL/runtime migration errors before release.

## Notes and current constraints

- Migrations are forward-only in code; there are no explicit down migrations.
- Recovery relies on backups and reset flow rather than automated rollback.
- DB access should remain centralized in main-process DB modules (`electron/db/*`) to avoid divergent schema logic.

## Related docs

- Architecture overview: `docs/architecture.md`
- Cross-cutting features (My Day, Team, search, layout): `docs/features.md`
- Metrics definitions: `docs/metrics.md`
- Notifications system: `docs/notifications.md`
- Product roadmap: `docs/roadmap.md`
