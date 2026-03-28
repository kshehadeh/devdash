import { ipcMain } from "electron";
import { getDb } from "../db/index";
import { getDeveloper } from "../db/developers";
import type { GlobalSearchResult } from "../types";

const NAV_ENTRIES: { id: string; label: string; path: string; keywords: string }[] = [
  { id: "nav-dash", label: "Dashboard", path: "/", keywords: "dashboard home ecosystem" },
  { id: "nav-myday", label: "My Day", path: "/my-day", keywords: "my day standup summary" },
  { id: "nav-team", label: "Team", path: "/team", keywords: "team overview metrics" },
  { id: "nav-reviews", label: "Reviews", path: "/reviews", keywords: "reviews pull request github" },
  { id: "nav-notifications", label: "Notifications", path: "/notifications", keywords: "notifications alerts" },
  { id: "nav-reminders", label: "Reminders", path: "/reminders", keywords: "reminders tasks" },
  { id: "nav-settings", label: "Settings", path: "/settings", keywords: "settings preferences" },
];

function norm(q: string): string {
  return q.trim().toLowerCase();
}

export function registerSearchHandlers() {
  ipcMain.handle(
    "search:global",
    async (_e, data: { developerId: string; query: string; limit?: number }) => {
      const { developerId, query } = data;
      const limit = Math.min(Math.max(data.limit ?? 20, 1), 50);
      const dev = getDeveloper(developerId);
      if (!dev) return [] as GlobalSearchResult[];

      const q = norm(query);
      if (q.length < 2) return [] as GlobalSearchResult[];

      const out: GlobalSearchResult[] = [];

      for (const nav of NAV_ENTRIES) {
        if (nav.label.toLowerCase().includes(q) || nav.keywords.includes(q)) {
          out.push({
            kind: "nav",
            id: nav.id,
            title: nav.label,
            subtitle: "Go to page",
            openUrl: null,
            navigatePath: nav.path,
          });
        }
      }

      const db = getDb();

      const prRows = db.prepare(`
        SELECT pr_number, repo, title
        FROM cached_pull_requests
        WHERE developer_id = ?
          AND (
            INSTR(LOWER(title), ?) > 0
            OR INSTR(LOWER(repo), ?) > 0
            OR INSTR(CAST(pr_number AS TEXT), ?) > 0
          )
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(developerId, q, q, q, limit) as { pr_number: number; repo: string; title: string }[];

      for (const row of prRows) {
        out.push({
          kind: "pr",
          id: `pr-${row.repo}-${row.pr_number}`,
          title: row.title,
          subtitle: `${row.repo}#${row.pr_number}`,
          openUrl: `https://github.com/${row.repo}/pull/${row.pr_number}`,
          navigatePath: null,
        });
      }

      const ticketRows = db.prepare(`
        SELECT issue_key, summary, project_key
        FROM cached_jira_tickets
        WHERE developer_id = ?
          AND (INSTR(LOWER(issue_key), ?) > 0 OR INSTR(LOWER(summary), ?) > 0)
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(developerId, q, q, limit) as { issue_key: string; summary: string; project_key: string | null }[];

      for (const row of ticketRows) {
        out.push({
          kind: "ticket",
          id: `jira-${row.issue_key}`,
          title: row.summary,
          subtitle: row.issue_key + (row.project_key ? ` · ${row.project_key}` : ""),
          openUrl: null,
          navigatePath: "/",
        });
      }

      const linearRows = db.prepare(`
        SELECT issue_id, identifier, title, team_key
        FROM cached_linear_issues
        WHERE developer_id = ?
          AND (INSTR(LOWER(identifier), ?) > 0 OR INSTR(LOWER(title), ?) > 0)
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(developerId, q, q, limit) as { issue_id: string; identifier: string; title: string; team_key: string | null }[];

      for (const row of linearRows) {
        out.push({
          kind: "ticket",
          id: `linear-${row.issue_id}`,
          title: row.title,
          subtitle: row.identifier + (row.team_key ? ` · ${row.team_key}` : ""),
          openUrl: null,
          navigatePath: "/",
        });
      }

      const remRows = db.prepare(`
        SELECT id, title, status
        FROM reminders
        WHERE developer_id = ?
          AND INSTR(LOWER(title), ?) > 0
        ORDER BY remind_at DESC
        LIMIT ?
      `).all(developerId, q, limit) as { id: string; title: string; status: string }[];

      for (const row of remRows) {
        out.push({
          kind: "reminder",
          id: row.id,
          title: row.title,
          subtitle: row.status,
          openUrl: null,
          navigatePath: "/reminders",
        });
      }

      const notifRows = db.prepare(`
        SELECT id, title, body, integration
        FROM notifications
        WHERE developer_id = ?
          AND (INSTR(LOWER(title), ?) > 0 OR INSTR(LOWER(body), ?) > 0)
        ORDER BY created_at DESC
        LIMIT ?
      `).all(developerId, q, q, limit) as { id: string; title: string; body: string; integration: string }[];

      for (const row of notifRows) {
        out.push({
          kind: "notification",
          id: row.id,
          title: row.title,
          subtitle: row.integration,
          openUrl: null,
          navigatePath: "/notifications",
        });
      }

      return out.slice(0, limit);
    },
  );
}
