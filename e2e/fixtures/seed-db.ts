import Database from "better-sqlite3";
import * as fs from "fs";

import { MIGRATIONS } from "../../electron/db/schema";

/**
 * Creates a SQLite database pre-populated with realistic test data.
 * Uses better-sqlite3 directly — no Electron dependencies required.
 */
export function createSeededTestDb(dbPath: string): void {
  // Remove existing DB files
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = suffix ? `${dbPath}${suffix}` : dbPath;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // ── Run migrations ──────────────────────────────────────────────
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
  );
  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(
    -1,
  );
  for (let i = 0; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]);
    db.prepare("UPDATE schema_version SET version = ?").run(i);
  }

  // ── Developers ──────────────────────────────────────────────────
  const insertDev = db.prepare(`
    INSERT INTO developers (id, name, avatar, role, team, github_username, atlassian_email, is_current_user)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertDev.run(
    "dev-current",
    "Alex Chen",
    "https://avatars.example.com/alexchen.png",
    "Senior Engineer",
    "Platform",
    "alexchen",
    "alex.chen@example.com",
    1,
  );
  insertDev.run(
    "dev-teammate",
    "Jordan Lee",
    "https://avatars.example.com/jordanlee.png",
    "Engineer",
    "Platform",
    "jordanlee",
    "jordan.lee@example.com",
    0,
  );

  // ── Connections ─────────────────────────────────────────────────
  const insertConn = db.prepare(`
    INSERT INTO connections (id, encrypted_token, email, org, connected)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertConn.run("github", "dummy-github-token", null, null, 1);
  insertConn.run(
    "atlassian",
    "dummy-atlassian-token",
    "alex.chen@example.com",
    "acme-corp",
    1,
  );
  insertConn.run("linear", "dummy-linear-token", null, null, 1);

  // ── Data sources ────────────────────────────────────────────────
  const insertSrc = db.prepare(`
    INSERT INTO data_sources (id, type, provider_id, name, org, identifier)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertSrc.run(
    "ds-github-repo",
    "github_repo",
    "github",
    "devdash",
    "acme-corp",
    "acme-corp/devdash",
  );
  insertSrc.run(
    "ds-jira-project",
    "jira_project",
    "jira",
    "Platform Sprint",
    "acme-corp",
    "PLAT",
  );
  insertSrc.run(
    "ds-confluence-space",
    "confluence_space",
    "confluence",
    "Engineering Wiki",
    "acme-corp",
    "ENG",
  );

  // ── Developer ↔ source assignments ──────────────────────────────
  const insertDevSrc = db.prepare(`
    INSERT INTO developer_sources (developer_id, source_id) VALUES (?, ?)
  `);
  insertDevSrc.run("dev-current", "ds-github-repo");
  insertDevSrc.run("dev-current", "ds-jira-project");
  insertDevSrc.run("dev-current", "ds-confluence-space");
  insertDevSrc.run("dev-teammate", "ds-github-repo");

  // ── Integration settings (defaults inserted by migration v8) ───
  // Already present; nothing extra to do.

  // ── Developer integration identities ────────────────────────────
  // Migration v9 back-fills from legacy columns, but we insert
  // explicitly to guarantee payload content.
  db.prepare(`DELETE FROM developer_integration_identity`).run();
  const insertIdent = db.prepare(`
    INSERT INTO developer_integration_identity (developer_id, category, provider_id, payload_json)
    VALUES (?, ?, ?, ?)
  `);
  insertIdent.run(
    "dev-current",
    "code",
    "github",
    JSON.stringify({ githubUsername: "alexchen" }),
  );
  insertIdent.run(
    "dev-current",
    "work",
    "jira",
    JSON.stringify({ workEmail: "alex.chen@example.com" }),
  );
  insertIdent.run(
    "dev-current",
    "docs",
    "confluence",
    JSON.stringify({ atlassianEmail: "alex.chen@example.com" }),
  );
  insertIdent.run(
    "dev-teammate",
    "code",
    "github",
    JSON.stringify({ githubUsername: "jordanlee" }),
  );

  // ── Cached contributions (30 days) ─────────────────────────────
  const insertContrib = db.prepare(`
    INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)
  `);
  const today = new Date();
  for (let d = 0; d < 30; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - d);
    const dateStr = dt.toISOString().slice(0, 10);
    // Vary contributions: weekdays get more, weekends fewer
    const dayOfWeek = dt.getDay();
    const count =
      dayOfWeek === 0 || dayOfWeek === 6
        ? Math.floor(Math.random() * 3)
        : 2 + Math.floor(Math.random() * 10);
    insertContrib.run("dev-current", dateStr, count);
  }

  // ── Cached pull requests ────────────────────────────────────────
  const insertPr = db.prepare(`
    INSERT INTO cached_pull_requests
      (developer_id, pr_number, repo, title, status, review_count, created_at, updated_at, merged_at, latest_review_state, pending_reviewers_json, first_review_submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const prs: Parameters<typeof insertPr.run>[] = [
    ["dev-current", 142, "acme-corp/devdash", "feat: add dashboard metrics panel", "open", 1, "2025-06-01T10:00:00Z", "2025-06-02T14:00:00Z", null, "COMMENTED", '["jordanlee"]', "2025-06-02T11:30:00Z"],
    ["dev-current", 139, "acme-corp/devdash", "fix: correct date range in contribution graph", "merged", 2, "2025-05-28T09:00:00Z", "2025-05-29T16:00:00Z", "2025-05-29T16:00:00Z", "APPROVED", "[]", "2025-05-29T10:00:00Z"],
    ["dev-current", 135, "acme-corp/devdash", "chore: upgrade electron to v41", "merged", 1, "2025-05-20T11:00:00Z", "2025-05-21T09:00:00Z", "2025-05-21T09:00:00Z", "APPROVED", "[]", "2025-05-20T15:00:00Z"],
    ["dev-current", 130, "acme-corp/devdash", "feat: notification preferences UI", "closed", 0, "2025-05-15T08:00:00Z", "2025-05-18T12:00:00Z", null, null, "[]", null],
    ["dev-current", 145, "acme-corp/devdash", "feat: linear integration sync", "open", 0, "2025-06-03T14:00:00Z", "2025-06-03T14:00:00Z", null, null, '["jordanlee"]', null],
    ["dev-teammate", 143, "acme-corp/devdash", "docs: update README with setup guide", "open", 0, "2025-06-02T11:00:00Z", "2025-06-02T11:00:00Z", null, null, '["alexchen"]', null],
  ];
  for (const pr of prs) insertPr.run(...pr);

  // ── Cached Jira tickets ─────────────────────────────────────────
  const insertTicket = db.prepare(`
    INSERT INTO cached_jira_tickets
      (developer_id, issue_key, summary, status, status_category, project_key, priority, issue_type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tickets: Parameters<typeof insertTicket.run>[] = [
    ["dev-current", "PLAT-201", "Implement dashboard skeleton loading states", "In Progress", "in_progress", "PLAT", "high", "Story", "2025-06-03T10:00:00Z"],
    ["dev-current", "PLAT-198", "Add rate-limit retry logic for GitHub sync", "To Do", "todo", "PLAT", "medium", "Task", "2025-06-01T09:00:00Z"],
    ["dev-current", "PLAT-195", "Fix timezone offset in contribution chart", "Done", "done", "PLAT", "medium", "Bug", "2025-05-30T16:00:00Z"],
    ["dev-current", "PLAT-190", "Set up E2E test infrastructure", "To Do", "todo", "PLAT", "low", "Task", "2025-05-28T11:00:00Z"],
    ["dev-current", "PLAT-188", "Research Linear API pagination", "Done", "done", "PLAT", "low", "Spike", "2025-05-25T14:00:00Z"],
  ];
  for (const t of tickets) insertTicket.run(...t);

  // ── Cached Confluence pages ─────────────────────────────────────
  const insertPage = db.prepare(`
    INSERT INTO cached_confluence_pages
      (developer_id, page_id, title, space_key, version_count, view_count, last_modified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertPage.run("dev-current", "pg-101", "DevDash Architecture Overview", "ENG", 8, 124, "2025-06-01T12:00:00Z");
  insertPage.run("dev-current", "pg-102", "Integration Provider Guide", "ENG", 3, 47, "2025-05-25T09:00:00Z");
  insertPage.run("dev-current", "pg-103", "Sprint Retrospective – May 2025", "ENG", 2, 31, "2025-05-30T17:00:00Z");

  // ── Cached Linear issues ───────────────────────────────────────
  const insertLinear = db.prepare(`
    INSERT INTO cached_linear_issues
      (developer_id, issue_id, identifier, title, state_name, state_type, team_key, team_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertLinear.run("dev-current", "lin-001", "DASH-42", "Add keyboard shortcuts for navigation", "In Progress", "started", "DASH", "team-dash-1", "2025-06-03T09:00:00Z");
  insertLinear.run("dev-current", "lin-002", "DASH-39", "Tray icon click should focus window", "Todo", "unstarted", "DASH", "team-dash-1", "2025-06-01T15:00:00Z");
  insertLinear.run("dev-current", "lin-003", "DASH-35", "Persist window size and position", "Done", "completed", "DASH", "team-dash-1", "2025-05-28T11:00:00Z");

  // ── Sync log (all OK) ──────────────────────────────────────────
  const insertSync = db.prepare(`
    INSERT INTO sync_log (developer_id, data_type, last_synced_at, status)
    VALUES (?, ?, ?, 'ok')
  `);
  const syncTs = "2025-06-03T12:00:00Z";
  for (const dtype of [
    "github_contributions",
    "github_pull_requests",
    "jira_tickets",
    "confluence_pages",
    "linear_issues",
  ]) {
    insertSync.run("dev-current", dtype, syncTs);
  }

  // ── Notifications ───────────────────────────────────────────────
  const insertNotif = db.prepare(`
    INSERT INTO notifications
      (id, developer_id, integration, notification_type, fingerprint, title, body, payload_json, source_url, status, event_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertNotif.run(
    "notif-1",
    "dev-current",
    "github",
    "pr_review_requested",
    "acme-corp/devdash#143",
    "Review requested on docs: update README",
    "jordanlee requested your review on PR #143",
    JSON.stringify({ repo: "acme-corp/devdash", prNumber: 143 }),
    "https://github.com/acme-corp/devdash/pull/143",
    "new",
    "2025-06-02T11:00:00Z",
  );
  insertNotif.run(
    "notif-2",
    "dev-current",
    "jira",
    "ticket_assigned",
    "PLAT-201",
    "Ticket assigned: PLAT-201",
    "You were assigned PLAT-201: Implement dashboard skeleton loading states",
    JSON.stringify({ issueKey: "PLAT-201" }),
    "https://acme-corp.atlassian.net/browse/PLAT-201",
    "new",
    "2025-06-03T10:00:00Z",
  );

  // ── Reminders ───────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO reminders
      (id, developer_id, notification_id, title, comment, source_url, remind_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "rem-1",
    "dev-current",
    "notif-1",
    "Review PR #143",
    "Jordan needs this before standup",
    "https://github.com/acme-corp/devdash/pull/143",
    "2025-06-04T09:00:00Z",
    "pending",
  );

  db.close();
}
