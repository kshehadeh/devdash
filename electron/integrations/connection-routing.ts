import type { ConnectionId } from "../db/connections";
import type { CodeProviderId, DocsProviderId, IntegrationSettingsState, WorkProviderId } from "./types";

export function connectionIdForCodeProvider(provider: CodeProviderId): ConnectionId {
  if (provider === "github") return "github";
  throw new Error(`No connection mapping for code provider: ${provider}`);
}

export function connectionIdForWorkProvider(provider: WorkProviderId): ConnectionId {
  if (provider === "jira") return "atlassian";
  if (provider === "linear") return "linear";
  throw new Error(`No connection mapping for work provider: ${provider}`);
}

export function connectionIdForDocsProvider(provider: DocsProviderId): ConnectionId {
  if (provider === "confluence") return "atlassian";
  throw new Error(`No connection mapping for docs provider: ${provider}`);
}

/** True if the Atlassian connection should be loaded (Jira and/or Confluence active). */
export function needsAtlassianConnection(settings: IntegrationSettingsState): boolean {
  return settings.work === "jira" || settings.docs === "confluence";
}
