/** Product area an integration serves. */
export type IntegrationCategory = "code" | "work" | "docs";

export type CodeProviderId = "github";
export type WorkProviderId = "jira" | "linear";
export type DocsProviderId = "confluence";

export type IntegrationProviderId = CodeProviderId | WorkProviderId | DocsProviderId;

export interface IntegrationSettingsState {
  code: CodeProviderId;
  work: WorkProviderId;
  docs: DocsProviderId;
}

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettingsState = {
  code: "github",
  work: "jira",
  docs: "confluence",
};

export function isCodeProviderId(v: string): v is CodeProviderId {
  return v === "github";
}

export function isWorkProviderId(v: string): v is WorkProviderId {
  return v === "jira" || v === "linear";
}

export function isDocsProviderId(v: string): v is DocsProviderId {
  return v === "confluence";
}
