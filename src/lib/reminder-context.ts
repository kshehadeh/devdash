import type { NotificationRecord, NotificationSourceGroup } from "./types";

/** Matches dashboard context-menu item types (PR list, Jira tickets, Confluence docs). */
export type ReminderMenuItemType = "pr" | "ticket" | "doc";

export function formatReminderTitle(itemType: ReminderMenuItemType, rootDisplayTitle: string): string {
  const prefix =
    itemType === "pr" ? "PR: " : itemType === "ticket" ? "Ticket: " : "Doc: ";
  return `${prefix}${rootDisplayTitle}`;
}

function githubNotificationRootTitle(record: NotificationRecord): string {
  let t = record.title;
  if (t.startsWith("Stale PR: ")) t = t.slice("Stale PR: ".length);
  else if (t.startsWith("PR waiting for review: ")) t = t.slice("PR waiting for review: ".length);
  return t;
}

function reminderItemTypeForIntegration(integration: string): ReminderMenuItemType {
  switch (integration) {
    case "github":
      return "pr";
    case "jira":
      return "ticket";
    case "confluence":
      return "doc";
    default:
      return "doc";
  }
}

/** Fields passed to the native "Remind me" context menu (same shape as dashboard rows). */
export interface NotificationReminderMenuContext {
  /** Unprefixed root title — same semantics as `ContextMenuContext.title` on the dashboard. */
  title: string;
  url: string | null;
  itemType: ReminderMenuItemType;
  notificationId: string | null;
}

/**
 * Build reminder context for a notification row from its integration and payloads
 * so titles match dashboard context menus (PR title only, Jira "KEY: summary", page title).
 */
export function notificationReminderMenuContext(
  integration: string,
  record: NotificationRecord,
  sourceGroup: NotificationSourceGroup,
): NotificationReminderMenuContext {
  const itemType = reminderItemTypeForIntegration(integration);
  let rootTitle: string;
  if (integration === "github") {
    rootTitle = githubNotificationRootTitle(record);
  } else if (integration === "jira") {
    const issueKey = typeof record.payload.issueKey === "string" ? record.payload.issueKey : "unknown";
    rootTitle = `${issueKey}: ${record.title}`;
  } else if (integration === "confluence") {
    rootTitle =
      typeof record.payload.pageTitle === "string" ? record.payload.pageTitle : record.title;
  } else {
    rootTitle = sourceGroup.sourceLabel;
  }
  const url = sourceGroup.sourceUrl ?? record.sourceUrl ?? null;
  return {
    title: rootTitle,
    url,
    itemType,
    notificationId: record.id,
  };
}

/** Source-group header: same root item as dashboard; links reminder to the first notification if present. */
export function notificationSourceGroupReminderMenuContext(
  integration: string,
  sourceGroup: NotificationSourceGroup,
): NotificationReminderMenuContext | null {
  const first = sourceGroup.notifications[0];
  if (!first) return null;
  return notificationReminderMenuContext(integration, first, sourceGroup);
}
