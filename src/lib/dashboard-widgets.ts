export const DASHBOARD_WIDGET_IDS = [
  "metrics_bar",
  "triggered_reminders",
  "pull_requests",
  "open_tickets",
  "commit_activity",
  "pr_review_comments",
  "pr_comments_received",
  "documentation",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  metrics_bar: "Metrics bar",
  triggered_reminders: "Triggered reminders banner",
  pull_requests: "Pull requests",
  open_tickets: "Open tickets / issues",
  commit_activity: "Commit activity",
  pr_review_comments: "PR review activity (comments & approvals)",
  pr_comments_received: "PR comments received",
  documentation: "Documentation",
};

export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetId[] = [...DASHBOARD_WIDGET_IDS];

const SET = new Set<string>(DASHBOARD_WIDGET_IDS);

export function parseDashboardLayoutJson(raw: string | null | undefined): DashboardWidgetId[] {
  if (raw == null || raw === "") return [...DEFAULT_DASHBOARD_LAYOUT];
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [...DEFAULT_DASHBOARD_LAYOUT];
    const out: DashboardWidgetId[] = [];
    const seen = new Set<DashboardWidgetId>();
    for (const x of p) {
      if (typeof x !== "string" || !SET.has(x)) continue;
      const id = x as DashboardWidgetId;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    if (out.length === 0) return [...DEFAULT_DASHBOARD_LAYOUT];
    return out;
  } catch {
    return [...DEFAULT_DASHBOARD_LAYOUT];
  }
}

export function layoutToJson(layout: DashboardWidgetId[]): string {
  return JSON.stringify(layout);
}
