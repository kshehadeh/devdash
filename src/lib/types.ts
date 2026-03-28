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
  createdAt: string;
  updatedAt: string;
  mergedAt?: string | null;
  firstReviewSubmittedAt?: string | null;
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

export interface ConfluenceDoc {
  title: string;
  reads: number;
  edits: number;
  url?: string;
}

export interface ConfluenceActivity {
  type: "edit" | "comment";
  pageTitle: string;
  description: string;
  timeAgo: string;
  url?: string;
}

export interface JiraTicket {
  id: string;
  key: string;
  developerId?: string;
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
  confluenceDocs: ConfluenceDoc[];
  confluenceActivity: ConfluenceActivity[];
}

// Per-section API response types for progressive loading

export interface GithubStatsResponse {
  commitHistory: CommitDay[];
  commitsYTD: number;
  pullRequests: PullRequest[];
  providerId?: "github";
  _syncedAt?: string;
}

export interface VelocityStatsResponse {
  velocity: number;
  velocityChange: number;
  mergeRatio: number;
  reviewTurnaroundHours: number;
  providerId?: "github";
  _syncedAt?: string;
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

export interface PRReviewCommentsResponse {
  /** Inline PR review comments authored by the developer in the lookback window */
  commentsGiven: number;
  /** PR reviews with state APPROVED submitted by the developer in the lookback window */
  approvalsGiven: number;
  /** Inline + conversation comments from others on the developer’s PRs (cached authored PRs only) */
  commentsReceived: number;
  _syncedAtComments?: string;
  _syncedAtApprovals?: string;
}

export interface TeamOverviewRow {
  developerId: string;
  name: string;
  velocity: number;
  mergeRatio: number;
  reviewTurnaroundHours: number;
  workloadHealth: number;
  ticketVelocity: number;
  openPrCount: number;
  pendingReviewCount: number;
}

export interface TeamOverviewResponse {
  days: number;
  rows: TeamOverviewRow[];
}

export interface GlobalSearchResult {
  kind: "pr" | "ticket" | "reminder" | "notification" | "nav";
  id: string;
  title: string;
  subtitle: string;
  openUrl: string | null;
  navigatePath: string | null;
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

// ---------- Integration notifications ----------

export type NotificationStatus = "new" | "read";

export interface NotificationRecord {
  id: string;
  developerId: string;
  integration: string;
  notificationType: string;
  fingerprint: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  status: NotificationStatus;
  eventUpdatedAt: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPreference {
  integration: string;
  notificationType: string;
  enabled: boolean;
  fingerprintStrategy: Record<string, unknown>;
  updatedAt: string;
}

export interface NotificationsListResponse {
  notifications: NotificationRecord[];
  unreadCount: number;
}

export interface NotificationSourceGroup {
  sourceItemKey: string;
  sourceLabel: string;
  sourceUrl: string | null;
  count: number;
  unreadCount: number;
  latestAt: string;
  notifications: NotificationRecord[];
}

export interface NotificationGroup {
  notificationType: string;
  integration: string;
  label: string;
  count: number;
  unreadCount: number;
  sourceGroups: NotificationSourceGroup[];
}

export interface NotificationsGroupedResponse {
  groups: NotificationGroup[];
  totalUnreadCount: number;
}

// ---------- Reminders ----------

export type ReminderStatus = "pending" | "triggered" | "dismissed" | "snoozed";

export interface ReminderRecord {
  id: string;
  developerId: string;
  notificationId: string | null;
  title: string;
  comment: string;
  sourceUrl: string | null;
  remindAt: string;
  status: ReminderStatus;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RemindersListResponse {
  reminders: ReminderRecord[];
}

export interface ReminderCountResponse {
  count: number;
}
