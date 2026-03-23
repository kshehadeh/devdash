import { getDeveloper } from "../db/developers";
import { getConnection } from "../db/connections";
import { getSourcesForDeveloper } from "../db/sources";
import { getWorkEmailForDeveloper } from "../db/developer-identity";
import { getIntegrationSettings } from "../db/integration-settings";
import { fetchReviewRequests } from "../services/github";
import { fetchConfluenceActivity, fetchJiraAssignedOrWatchedUpdatedTickets } from "../services/atlassian";

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
      title: `Review requested: ${item.repo}#${item.number}`,
      body: item.title,
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
      title: `Jira updated: ${issue.key}`,
      body: issue.title,
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
};

const confluencePageEdited: NotificationDefinition = {
  integration: "confluence",
  notificationType: "page_activity",
  label: "Confluence Page Activity",
  defaultEnabled: false,
  strategy: { id: "description_timeago", version: 1 },
  async poll(developerId: string) {
    const atConn = getConnection("atlassian");
    const workEmail = getWorkEmailForDeveloper(developerId);
    if (!atConn?.connected || !atConn.token || !atConn.email || !atConn.org || !workEmail) return [];
    const spaces = getSourcesForDeveloper(developerId)
      .filter((s) => s.type === "confluence_space")
      .map((s) => s.identifier);
    const items = await fetchConfluenceActivity(atConn.org, atConn.email, atConn.token, workEmail, spaces);
    return items.map((item) => ({
      title: "Confluence activity",
      body: item.description,
      sourceUrl: item.url,
      // API only provides relative label in this endpoint. Use now so repeating activity labels still dedupe by fingerprint strategy changes.
      eventUpdatedAt: new Date().toISOString(),
      payload: {
        description: item.description,
        timeAgo: item.timeAgo,
      },
    }));
  },
  fingerprint(event) {
    const desc = typeof event.payload?.description === "string" ? event.payload.description : event.body;
    const rel = typeof event.payload?.timeAgo === "string" ? event.payload.timeAgo : "";
    return `${desc}:${rel}`;
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
