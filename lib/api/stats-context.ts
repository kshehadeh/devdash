import { getDeveloper } from "../db/developers";
import { getConnection, type ConnectionRecord } from "../db/connections";
import { getSourcesForDeveloper } from "../db/sources";
import type { Developer, JiraBoardRef } from "../types";

export interface StatsContext {
  developer: Developer;
  lookbackDays: number;
  ghConn: ConnectionRecord | null;
  atConn: ConnectionRecord | null;
  ghUsername: string | undefined;
  atEmail: string | undefined;
  repoFilter: { org: string; name: string }[];
  boardFilter: { id: number; name: string }[] | undefined;
  spaceFilter: string[];
  projectFilter: string[];
}

export function parseLookbackDays(searchParams: URLSearchParams): number {
  return Math.max(7, Math.min(365, parseInt(searchParams.get("days") ?? "30", 10) || 30));
}

export function getStatsContext(developerId: string, lookbackDays: number): StatsContext | null {
  const developer = getDeveloper(developerId);
  if (!developer) return null;

  const ghConn = getConnection("github");
  const atConn = getConnection("atlassian");

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

  return {
    developer,
    lookbackDays,
    ghConn,
    atConn,
    ghUsername: developer.githubUsername,
    atEmail: developer.atlassianEmail,
    repoFilter: ghRepos,
    boardFilter: jiraBoards.length > 0 ? jiraBoards : undefined,
    spaceFilter: confluenceSpaceKeys,
    projectFilter: jiraProjectKeys,
  };
}
