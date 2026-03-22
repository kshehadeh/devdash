import { getDeveloper } from "../db/developers";
import { getConnection, type ConnectionRecord } from "../db/connections";
import { getSourcesForDeveloper } from "../db/sources";
import { getWorkEmailForDeveloper } from "../db/developer-identity";
import { getIntegrationSettings } from "../db/integration-settings";
import {
  connectionIdForCodeProvider,
  connectionIdForWorkProvider,
  needsAtlassianConnection,
} from "../integrations/connection-routing";
import type { Developer, JiraBoardRef } from "../types";
import type { IntegrationSettingsState } from "../integrations/types";

export interface StatsContext {
  developer: Developer;
  lookbackDays: number;
  integration: IntegrationSettingsState;
  ghConn: ConnectionRecord | null;
  atConn: ConnectionRecord | null;
  linearConn: ConnectionRecord | null;
  ghUsername: string | undefined;
  /** Work-tool email (Jira / Linear assignee matching). */
  workEmail: string | undefined;
  repoFilter: { org: string; name: string }[];
  boardFilter: { id: number; name: string }[] | undefined;
  spaceFilter: string[];
  projectFilter: string[];
  /** Linear team UUIDs from assigned data sources. */
  linearTeamFilter: string[];
}

export function parseLookbackDays(searchParams: URLSearchParams): number {
  return Math.max(7, Math.min(365, parseInt(searchParams.get("days") ?? "30", 10) || 30));
}

export function getStatsContext(developerId: string, lookbackDays: number): StatsContext | null {
  const developer = getDeveloper(developerId);
  if (!developer) return null;

  const integration = getIntegrationSettings();

  const ghConn =
    integration.code === "github" ? getConnection(connectionIdForCodeProvider(integration.code)) : null;

  const atConn = needsAtlassianConnection(integration) ? getConnection("atlassian") : null;

  const linearConn =
    integration.work === "linear" ? getConnection(connectionIdForWorkProvider("linear")) : null;

  const devSources = getSourcesForDeveloper(developerId);
  const ghRepos = devSources
    .filter((s) => s.type === "github_repo")
    .map((s) => ({ org: s.org, name: s.identifier }));
  const jiraBoards = devSources
    .filter((s) => s.type === "jira_project")
    .flatMap((s) => (s.metadata?.boards ?? []) as JiraBoardRef[]);
  const confluenceSpaceKeys = devSources
    .filter((s) => s.type === "confluence_space")
    .map((s) => s.identifier);
  const jiraProjectKeys = devSources
    .filter((s) => s.type === "jira_project")
    .map((s) => s.identifier);
  const linearTeamIds = devSources
    .filter((s) => s.type === "linear_team")
    .map((s) => s.identifier);

  return {
    developer,
    lookbackDays,
    integration,
    ghConn,
    atConn,
    linearConn,
    ghUsername: developer.githubUsername,
    workEmail: getWorkEmailForDeveloper(developerId),
    repoFilter: ghRepos,
    boardFilter: jiraBoards.length > 0 ? jiraBoards : undefined,
    spaceFilter: confluenceSpaceKeys,
    projectFilter: jiraProjectKeys,
    linearTeamFilter: linearTeamIds,
  };
}
