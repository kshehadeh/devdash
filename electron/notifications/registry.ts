import { getDeveloper } from "../db/developers";
import { getConnection } from "../db/connections";
import { getSourcesForDeveloper } from "../db/sources";
import { getWorkEmailForDeveloper } from "../db/developer-identity";
import { getIntegrationSettings } from "../db/integration-settings";
import { fetchReviewRequests } from "../services/github";
import { fetchConfluenceActivity, fetchJiraAssignedOrWatchedUpdatedTickets } from "../services/atlassian";
import type { NotificationRecord } from "../db/notifications";

export interface NotificationEvent {
  title: string;
  body: string;
  sourceUrl?: string;
  eventUpdatedAt: string;
  payload?: Record<string, unknown>;
}

export interface NotificationDefinition {
  integration: string;
  notificationType: string;
  label: string;
  defaultEnabled: boolean;
  strategy: { id: string; version: number };
  poll: (developerId: string) => Promise<NotificationEvent[]>;
  fingerprint: (event: NotificationEvent) => string;
  /** Stable key identifying the source item (e.g. "repo:prNumber", "PROJ-123"). Used for sub-grouping. */
  sourceItemKey: (record: NotificationRecord) => string;
  /** Human-readable label for the source item group header. */
  sourceItemLabel: (record: NotificationRecord) => string;
}

const githubReviewRequested: NotificationDefinition = {
  integration: "github",
  notificationType: "review_requested",
  label: "Review Requested",
  defaultEnabled: true,
  strategy: { id: "repo_pr_updated_at", version: 1 },
  async poll(developerId: string) {
    const dev = getDeveloper(developerId);
    const conn = getConnection("github");
    if (!dev?.githubUsername || !conn?.connected || !conn.token) return [];
    const repos = getSourcesForDeveloper(developerId)
      .filter((s) => s.type === "github_repo")
      .map((s) => ({ org: s.org, name: s.identifier }));
    const items = await fetchReviewRequests(conn.token, dev.githubUsername, repos.length ? repos : undefined, 20);
    return items.map((item) => ({
      title: item.title,
      body: `${item.repo}#${item.number}`,
      sourceUrl: item.url,
      eventUpdatedAt: item.updatedAt,
      payload: {
        repo: item.repo,
        prNumber: item.number,
        authorLogin: item.authorLogin,
      },
    }));
  },
  fingerprint(event) {
    const repo = typeof event.payload?.repo === "string" ? event.payload.repo : "unknown";
    const prNumber = typeof event.payload?.prNumber === "number" ? event.payload.prNumber : 0;
    return `${repo}:${prNumber}:${event.eventUpdatedAt}`;
  },
  sourceItemKey(record) {
    const repo = typeof record.payload.repo === "string" ? record.payload.repo : "unknown";
    const prNumber = typeof record.payload.prNumber === "number" ? record.payload.prNumber : 0;
    return `${repo}:${prNumber}`;
  },
  sourceItemLabel(record) {
    const repo = typeof record.payload.repo === "string" ? record.payload.repo : "unknown";
    const prNumber = typeof record.payload.prNumber === "number" ? record.payload.prNumber : 0;
    return `${repo} #${prNumber}: ${record.title}`;
  },
};

const jiraUpdatedTickets: NotificationDefinition = {
  integration: "jira",
  notificationType: "assigned_or_watched_ticket_updated",
  label: "Assigned/Watched Ticket Updated",
  defaultEnabled: false,
  strategy: { id: "issue_key_updated_at_v2", version: 2 },
  async poll(developerId: string) {
    const atConn = getConnection("atlassian");
    if (!atConn?.connected || !atConn.token || !atConn.email || !atConn.org) return [];
    const projects = getSourcesForDeveloper(developerId)
      .filter((s) => s.type === "jira_project")
      .map((s) => s.identifier);
    const issues = await fetchJiraAssignedOrWatchedUpdatedTickets(
      atConn.org,
      atConn.email,
      atConn.token,
      projects,
      7,
    );
    return issues.map((issue) => ({
      title: issue.title,
      body: issue.key,
      sourceUrl: issue.url,
      eventUpdatedAt: issue.updatedAt,
      payload: {
        issueKey: issue.key,
        status: issue.status,
      },
    }));
  },
  fingerprint(event) {
    const issueKey = typeof event.payload?.issueKey === "string" ? event.payload.issueKey : "unknown";
    return `${issueKey}:${event.eventUpdatedAt}`;
  },
  sourceItemKey(record) {
    return typeof record.payload.issueKey === "string" ? record.payload.issueKey : "unknown";
  },
  sourceItemLabel(record) {
    const issueKey = typeof record.payload.issueKey === "string" ? record.payload.issueKey : "unknown";
    return `${issueKey}: ${record.title}`;
  },
};

const confluencePageEdited: NotificationDefinition = {
  integration: "confluence",
  notificationType: "page_activity",
  label: "Confluence Page Activity",
  defaultEnabled: false,
  strategy: { id: "page_title_updated_at", version: 1 },
  async poll(developerId: string) {
    const atConn = getConnection("atlassian");
    const workEmail = getWorkEmailForDeveloper(developerId);
    if (!atConn?.connected || !atConn.token || !atConn.email || !atConn.org || !workEmail) return [];
    const spaces = getSourcesForDeveloper(developerId)
      .filter((s) => s.type === "confluence_space")
      .map((s) => s.identifier);
    const items = await fetchConfluenceActivity(atConn.org, atConn.email, atConn.token, workEmail, spaces);
    return items.map((item) => ({
      title: item.pageTitle,
      body: "",
      sourceUrl: item.url,
      eventUpdatedAt: item.updatedAt,
      payload: {
        pageTitle: item.pageTitle,
        timeAgo: item.timeAgo,
        updatedAt: item.updatedAt,
      },
    }));
  },
  fingerprint(event) {
    const pageTitle = typeof event.payload?.pageTitle === "string" ? event.payload.pageTitle : event.title;
    return `${pageTitle}:${event.eventUpdatedAt}`;
  },
  sourceItemKey(record) {
    return typeof record.payload.pageTitle === "string" ? record.payload.pageTitle : record.title;
  },
  sourceItemLabel(record) {
    return typeof record.payload.pageTitle === "string" ? record.payload.pageTitle : record.title;
  },
};

const ALL_DEFINITIONS: NotificationDefinition[] = [
  githubReviewRequested,
  jiraUpdatedTickets,
  confluencePageEdited,
];

export function getRegisteredNotificationDefinitions(): NotificationDefinition[] {
  const settings = getIntegrationSettings();
  return ALL_DEFINITIONS.filter((def) => {
    if (def.integration === "github") return settings.code === "github";
    if (def.integration === "jira") return settings.work === "jira";
    if (def.integration === "confluence") return settings.docs === "confluence";
    return false;
  });
}
