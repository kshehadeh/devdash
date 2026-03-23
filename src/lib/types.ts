export interface Developer {
  id: string;
  name: string;
  avatar: string;
  role: string;
  team: string;
  isCurrentUser: boolean;
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

export type PullReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | null;

export interface ReviewRequestItem {
  id: string;
  title: string;
  repo: string;
  number: number;
  url: string;
  authorLogin: string;
  updatedAt: string;
  timeAgo: string;
}

export interface MyPRReviewItem {
  id: string;
  title: string;
  repo: string;
  number: number;
  url: string;
  status: "open";
  updatedAt: string;
  timeAgo: string;
  reviewCount: number;
  latestReviewState: PullReviewState;
  pendingReviewerLogins: string[];
}

export interface ReviewsResponse {
  requestedOfYou: ReviewRequestItem[];
  onYourPullRequests: MyPRReviewItem[];
  error?: string;
  _syncedAt?: string;
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
  providerId?: "github";
  _syncedAt?: string;
}

export interface VelocityStatsResponse {
  velocity: number;
  velocityChange: number;
  mergeRatio: number;
  providerId?: "github";
  _syncedAt?: string;
}

export interface SprintStatsResponse {
  sprint: Sprint;
}

export interface TicketsStatsResponse {
  jiraTickets: JiraTicket[];
  workloadHealth: number;
  ticketVelocity: number;
  providerId?: "jira" | "linear";
  _syncedAt?: string;
}

export interface ConfluenceStatsResponse {
  confluenceDocs: ConfluenceDoc[];
  confluenceActivity: ConfluenceActivity[];
  docAuthorityLevel: number;
  providerId?: "confluence";
  _syncedAt?: string;
}

export type DataSourceType = "github_repo" | "jira_project" | "confluence_space" | "linear_team";

export interface JiraBoardRef {
  id: number;
  name: string;
}

export interface DataSource {
  id: string;
  type: DataSourceType;
  providerId?: string | null;
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

// ---------- Sync / status bar ----------

export type SyncScope = "idle" | "full" | "single";

export interface SyncProgressPayload {
  syncing: boolean;
  scope: SyncScope;
  developerName?: string;
  developerIndex?: number;
  developerTotal?: number;
  completedSteps: number;
  totalSteps: number;
  activeLabels: string[];
  phase: "sync" | "prune";
}

export interface SyncStatusDeveloper {
  id: string;
  name: string;
  lastSyncedAt: string | null;
  types: Record<string, { lastSyncedAt: string; status: string; errorMessage: string | null }>;
}

export interface SyncStatusResponse {
  syncing: boolean;
  developers: SyncStatusDeveloper[];
  progress: SyncProgressPayload;
}

export type AppNotificationType = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  message: string;
  type: AppNotificationType;
  createdAt: number;
}

// ---------- App updates ----------

export type UpdateCheckResponse =
  | { status: "up-to-date" }
  | { status: "available"; version: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

export type DownloadInstallResult = { ok: true } | { ok: false; message: string };
