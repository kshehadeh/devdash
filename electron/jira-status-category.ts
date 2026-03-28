import type { JiraTicket } from "./types";

/**
 * Map Jira REST `status.statusCategory.key` only (Jira "Status category": To Do / In progress / Done).
 * @see https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-workflow-statuses/
 */
export function jiraStatusCategoryFromApi(statusCategoryKey: string): JiraTicket["statusCategory"] {
  const key = (statusCategoryKey || "").toLowerCase();
  if (key === "done") return "done";
  if (key === "indeterminate") return "in_progress";
  return "todo";
}
