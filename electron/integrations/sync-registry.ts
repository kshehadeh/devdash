import { syncContributions, syncPullRequests } from "../sync/github-sync";
import { syncJiraTickets, syncConfluencePages } from "../sync/atlassian-sync";
import { syncLinearIssues } from "../sync/linear-sync";
import { getIntegrationSettings } from "../db/integration-settings";
import type { IntegrationCategory } from "./types";
import type { CodeProviderId, DocsProviderId, WorkProviderId } from "./types";

export interface RegisteredSyncTask {
  id: string;
  label: string;
  run: (developerId: string) => Promise<void>;
}

interface TaskDef {
  id: string;
  label: string;
  category: IntegrationCategory;
  provider: CodeProviderId | WorkProviderId | DocsProviderId;
  run: (developerId: string) => Promise<void>;
}

const ALL_TASKS: TaskDef[] = [
  {
    id: "github_contributions",
    label: "GitHub contributions",
    category: "code",
    provider: "github",
    run: syncContributions,
  },
  {
    id: "github_pull_requests",
    label: "GitHub pull requests",
    category: "code",
    provider: "github",
    run: syncPullRequests,
  },
  {
    id: "jira_tickets",
    label: "Jira tickets",
    category: "work",
    provider: "jira",
    run: syncJiraTickets,
  },
  {
    id: "linear_issues",
    label: "Linear issues",
    category: "work",
    provider: "linear",
    run: syncLinearIssues,
  },
  {
    id: "confluence_pages",
    label: "Confluence pages",
    category: "docs",
    provider: "confluence",
    run: syncConfluencePages,
  },
];

export function getRegisteredSyncTasks(): RegisteredSyncTask[] {
  const s = getIntegrationSettings();
  return ALL_TASKS.filter((t) => {
    if (t.category === "code") return t.provider === s.code;
    if (t.category === "work") return t.provider === s.work;
    if (t.category === "docs") return t.provider === s.docs;
    return false;
  }).map(({ id, label, run }) => ({ id, label, run }));
}
