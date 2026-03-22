export interface Developer {
  id: string;
  name: string;
  avatar: string;
  role: string;
  team: string;
  githubUsername?: string;
  atlassianEmail?: string;
}

export interface PullRequest {
  id: string;
  title: string;
  repo: string;
  number: number;
  url: string;
  status: "merged" | "open" | "closed";
  reviewCount?: number;
  updatedAt: string;
  timeAgo: string;
  isActive?: boolean;
}

export interface SprintIssue {
  id: string;
  key: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  points: number;
  priority: "low" | "medium" | "high" | "critical";
}

export interface Sprint {
  name: string;
  currentDay: number;
  totalDays: number;
  status: "on_track" | "at_risk" | "blocked";
  cycleTime: number;
  throughput: number;
  overdueCount: number;
  issues: SprintIssue[];
}

export interface ConfluenceDoc {
  title: string;
  reads: number;
  edits: number;
  url?: string;
}

export interface ConfluenceActivity {
  type: "edit" | "comment";
  description: string;
  timeAgo: string;
  url?: string;
}

export interface JiraTicket {
  id: string;
  key: string;
  title: string;
  status: string;
  statusCategory: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "critical";
  type: string;
  updatedAt: string;
  updatedAgo: string;
  url: string;
}

export interface CommitDay {
  date: string;
  count: number;
}

export interface DeveloperStats {
  developer: Developer;
  lookbackDays: number;
  velocity: number;
  velocityChange: number;
  mergeRatio: number;
  workloadHealth: number;
  ticketVelocity: number;
  docAuthorityLevel: number;
  commitsYTD: number;
  commitHistory: CommitDay[];
  pullRequests: PullRequest[];
  jiraTickets: JiraTicket[];
  sprint: Sprint;
  confluenceDocs: ConfluenceDoc[];
  confluenceActivity: ConfluenceActivity[];
  effortDistribution: {
    feature: number;
    bugFix: number;
    codeReview: number;
  };
  performanceTrajectory: "exceptional" | "strong" | "on_track" | "needs_improvement";
}

// Per-section API response types for progressive loading

export interface GithubStatsResponse {
  commitHistory: CommitDay[];
  commitsYTD: number;
  pullRequests: PullRequest[];
  effortDistribution: { feature: number; bugFix: number; codeReview: number };
}

export interface VelocityStatsResponse {
  velocity: number;
  velocityChange: number;
  mergeRatio: number;
}

export interface SprintStatsResponse {
  sprint: Sprint;
}

export interface TicketsStatsResponse {
  jiraTickets: JiraTicket[];
  workloadHealth: number;
  ticketVelocity: number;
}

export interface ConfluenceStatsResponse {
  confluenceDocs: ConfluenceDoc[];
  confluenceActivity: ConfluenceActivity[];
  docAuthorityLevel: number;
}

export type DataSourceType = "github_repo" | "jira_project" | "confluence_space";

export interface JiraBoardRef {
  id: number;
  name: string;
}

export interface DataSource {
  id: string;
  type: DataSourceType;
  name: string;
  org: string;
  identifier: string;
  metadata: {
    boards?: JiraBoardRef[];
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperSourceAssignment {
  developerId: string;
  sourceId: string;
}
