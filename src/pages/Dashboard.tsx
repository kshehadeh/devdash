import { useState, useEffect, useCallback, Fragment, useMemo } from "react";
import { Github, BookOpen, Calendar, Ticket, FileText, LayoutGrid } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { MetricsBar } from "@/components/dashboard/MetricsBar";
import { CommitBarChart } from "@/components/dashboard/CommitBarChart";
import {
  PRApprovalsGivenCard,
  PRCommentsGivenCard,
  PRCommentsReceivedCard,
  PR_METRIC_CARD_CLASS,
} from "@/components/dashboard/PRReviewActivityCard";
import { PullRequestList } from "@/components/dashboard/PullRequestList";
import { ConfluenceSection } from "@/components/dashboard/ConfluenceSection";
import { JiraTicketList } from "@/components/dashboard/JiraTicketList";
import { TriggeredRemindersBanner } from "@/components/reminders/TriggeredRemindersBanner";
import { DashboardCustomizeDialog } from "@/components/dashboard/DashboardCustomizeDialog";
import { type DashboardWidgetId, parseDashboardLayoutJson } from "@/lib/dashboard-widgets";
import { invoke, useIpc } from "@/lib/api";
import { useSelectedDeveloper } from "@/context/SelectedDeveloperContext";
import type {
  Developer,
  GithubStatsResponse,
  VelocityStatsResponse,
  TicketsStatsResponse,
  ConfluenceStatsResponse,
  PRReviewCommentsResponse,
} from "@/lib/types";

const LOOKBACK_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
];

const PR_METRICS_WIDGET_IDS = new Set<DashboardWidgetId>(["pr_review_comments", "pr_comments_received"]);

type DashboardLayoutSegment =
  | { type: "single"; id: DashboardWidgetId }
  | { type: "pr_metrics"; ids: DashboardWidgetId[] };

function segmentDashboardLayout(layout: DashboardWidgetId[]): DashboardLayoutSegment[] {
  const out: DashboardLayoutSegment[] = [];
  let i = 0;
  while (i < layout.length) {
    const w = layout[i];
    if (PR_METRICS_WIDGET_IDS.has(w)) {
      const ids: DashboardWidgetId[] = [];
      while (i < layout.length && PR_METRICS_WIDGET_IDS.has(layout[i])) {
        ids.push(layout[i]);
        i++;
      }
      out.push({ type: "pr_metrics", ids });
    } else {
      out.push({ type: "single", id: w });
      i++;
    }
  }
  return out;
}

export default function DashboardPage() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const { selectedDevId, setSelectedDevId } = useSelectedDeveloper();
  const [lookbackDays, setLookbackDays] = useState<number>(() => {
    const stored = localStorage.getItem("devdash.lookbackDays");
    return stored ? parseInt(stored, 10) : 30;
  });
  const [loading, setLoading] = useState(true);
  const [widgetLayout, setWidgetLayout] = useState<DashboardWidgetId[]>(() => parseDashboardLayoutJson(undefined));
  const layoutSegments = useMemo(() => segmentDashboardLayout(widgetLayout), [widgetLayout]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMd, setReportMd] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    void invoke<string | null>("app-config:get", { key: "dashboard_widget_layout_json" }).then((raw) =>
      setWidgetLayout(parseDashboardLayoutJson(raw ?? undefined)),
    );
  }, []);

  const reloadLayout = useCallback(() => {
    void invoke<string | null>("app-config:get", { key: "dashboard_widget_layout_json" }).then((raw) =>
      setWidgetLayout(parseDashboardLayoutJson(raw ?? undefined)),
    );
  }, []);

  const exportWeeklyReport = useCallback(async () => {
    if (!selectedDevId) return;
    setReportLoading(true);
    try {
      const md = await invoke<string>("stats:weekly-report-markdown", {
        developerId: selectedDevId,
        days: lookbackDays,
      });
      setReportMd(md);
      setReportOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setReportLoading(false);
    }
  }, [selectedDevId, lookbackDays]);

  useEffect(() => {
    localStorage.setItem("devdash.lookbackDays", lookbackDays.toString());
  }, [lookbackDays]);

  const fetchDevelopers = useCallback(async () => {
    try {
      const data = await invoke<Developer[]>("developers:list");
      if (!Array.isArray(data)) return;
      setDevelopers(data);
      if (data.length > 0) {
        setSelectedDevId((prev) => (data.find((d: Developer) => d.id === prev) ? prev : data[0].id));
      }
    } catch (err) {
      console.error("Failed to fetch developers:", err);
    } finally {
      setLoading(false);
    }
  }, [setSelectedDevId]);

  useEffect(() => {
    fetchDevelopers();
  }, [fetchDevelopers]);

  const needsPrReviewStats =
    widgetLayout.includes("pr_review_comments") || widgetLayout.includes("pr_comments_received");

  const github = useIpc<GithubStatsResponse>(selectedDevId ? "stats:code" : null, [{ developerId: selectedDevId, days: lookbackDays }]);
  const velocity = useIpc<VelocityStatsResponse>(selectedDevId ? "stats:velocity" : null, [{ developerId: selectedDevId, days: lookbackDays }]);
  const tickets = useIpc<TicketsStatsResponse>(selectedDevId ? "stats:work" : null, [{ developerId: selectedDevId, days: lookbackDays }]);
  const confluence = useIpc<ConfluenceStatsResponse>(selectedDevId ? "stats:docs" : null, [{ developerId: selectedDevId, days: lookbackDays }]);
  const reviewComments = useIpc<PRReviewCommentsResponse>(
    selectedDevId && needsPrReviewStats ? "stats:review-comments" : null,
    [{ developerId: selectedDevId, days: lookbackDays }],
  );

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
          <span className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
            Developer Performance
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-[var(--surface)]">
          <span className="text-sm text-[var(--on-surface-variant)]">Loading...</span>
        </div>
      </div>
    );
  }

  const hasNoDev = developers.length === 0;
  const noDevSelected = !selectedDevId;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        developers={developers}
        selectedId={selectedDevId}
        onSelect={setSelectedDevId}
        onDevelopersChange={fetchDevelopers}
      />

      <main className="flex-1 overflow-y-auto p-6 bg-[var(--surface)]">
        {hasNoDev || noDevSelected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-[var(--on-surface-variant)]">
              {hasNoDev
                ? "Add a developer to get started."
                : "Select a developer to view their dashboard."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-[var(--on-surface)] mb-1">Ecosystem Impact</h2>
                <p className="text-xs font-label text-[var(--on-surface-variant)]">
                  Code, work tracking, and documentation metrics from your connected tools
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => void exportWeeklyReport()}
                  disabled={reportLoading}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[var(--surface-container-high)] transition-colors disabled:opacity-40"
                  title="Generate Markdown summary for the selected period"
                >
                  <FileText size={14} className="text-[var(--on-surface-variant)]" />
                  <span className="text-[10px] font-label text-[var(--on-surface-variant)]">
                    {reportLoading ? "…" : "Report"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomizeOpen(true)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[var(--surface-container-high)] transition-colors"
                  title="Show or hide dashboard sections"
                >
                  <LayoutGrid size={14} className="text-[var(--on-surface-variant)]" />
                  <span className="text-[10px] font-label text-[var(--on-surface-variant)]">Layout</span>
                </button>

                <div className="w-px h-4 bg-[var(--outline-variant)]/30 hidden sm:block" />

                <Calendar size={14} className="text-[var(--on-surface-variant)] shrink-0" />
                <div className="flex bg-[var(--surface-container)] rounded-md overflow-hidden">
                  {LOOKBACK_OPTIONS.map((opt) => (
                    <button
                      key={opt.days}
                      onClick={() => setLookbackDays(opt.days)}
                      className={`px-3 py-1.5 text-xs font-label font-medium transition-colors ${
                        lookbackDays === opt.days
                          ? "bg-[var(--primary)] text-[var(--on-primary)]"
                          : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 mt-2">
              {layoutSegments.map((seg, segIdx) => {
                if (seg.type === "pr_metrics") {
                  return (
                    <div key={`pr-metrics-${segIdx}`} className="flex flex-wrap gap-4 items-stretch">
                      {reviewComments.loading ? (
                        <>
                          {seg.ids.includes("pr_review_comments") ? (
                            <>
                              <CardSkeleton lines={3} className={PR_METRIC_CARD_CLASS} />
                              <CardSkeleton lines={3} className={PR_METRIC_CARD_CLASS} />
                            </>
                          ) : null}
                          {seg.ids.includes("pr_comments_received") ? (
                            <CardSkeleton lines={3} className={PR_METRIC_CARD_CLASS} />
                          ) : null}
                        </>
                      ) : reviewComments.data ? (
                        <>
                          {seg.ids.includes("pr_review_comments") ? (
                            <>
                              <PRCommentsGivenCard
                                commentsGiven={reviewComments.data.commentsGiven}
                                lookbackDays={lookbackDays}
                              />
                              <PRApprovalsGivenCard
                                approvalsGiven={reviewComments.data.approvalsGiven}
                                lookbackDays={lookbackDays}
                              />
                            </>
                          ) : null}
                          {seg.ids.includes("pr_comments_received") ? (
                            <PRCommentsReceivedCard
                              commentsReceived={reviewComments.data.commentsReceived}
                              lookbackDays={lookbackDays}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                }

                const wid = seg.id;
                return (
                  <Fragment key={wid}>
                    {wid === "metrics_bar" ? (
                      <MetricsBar
                        lookbackDays={lookbackDays}
                        velocity={velocity.data}
                        tickets={tickets.data}
                        confluence={confluence.data}
                        velocityLoading={velocity.loading}
                        ticketsLoading={tickets.loading}
                        confluenceLoading={confluence.loading}
                      />
                    ) : null}
                    {wid === "triggered_reminders" ? <TriggeredRemindersBanner /> : null}
                    {wid === "pull_requests" ? (
                      github.loading ? (
                        <CardSkeleton lines={5} />
                      ) : github.data ? (
                        <Card>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Github size={16} className="text-[var(--primary)]" />
                              <h3 className="text-sm font-semibold text-[var(--on-surface)]">Pull Requests</h3>
                              {(github.data.openAuthoredPullRequests?.length ?? 0) > 0 && (
                                <span className="text-[10px] font-label font-bold bg-[var(--primary-container)] text-[var(--on-primary)] px-1.5 py-0.5 rounded-full">
                                  {github.data.openAuthoredPullRequests?.length ?? 0}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-label text-[var(--on-surface-variant)]">Open</span>
                          </div>
                          <PullRequestList prs={github.data.openAuthoredPullRequests ?? []} />
                        </Card>
                      ) : null
                    ) : null}
                    {wid === "open_tickets" ? (
                      tickets.loading ? (
                        <CardSkeleton lines={5} />
                      ) : tickets.data ? (
                        <Card>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Ticket size={16} className="text-[var(--primary)]" />
                              <h3 className="text-sm font-semibold text-[var(--on-surface)]">
                                {tickets.data?.providerId === "linear" ? "Linear issues" : "Tickets"}
                              </h3>
                              {tickets.data.jiraTickets.length > 0 && (
                                <span className="text-[10px] font-label font-bold bg-[var(--primary-container)] text-[var(--on-primary)] px-1.5 py-0.5 rounded-full">
                                  {tickets.data.jiraTickets.length}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
                              Active
                            </span>
                          </div>
                          <JiraTicketList tickets={tickets.data.jiraTickets} onInvalidTicket={tickets.refresh} />
                        </Card>
                      ) : null
                    ) : null}
                    {wid === "commit_activity" ? (
                      github.loading ? (
                        <CardSkeleton lines={8} />
                      ) : github.data ? (
                        <Card>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Github size={16} className="text-[var(--primary)]" />
                              <h3 className="text-sm font-semibold text-[var(--on-surface)]">Commit Activity</h3>
                            </div>
                            <span className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
                              Last {lookbackDays} days
                            </span>
                          </div>
                          <CommitBarChart commits={github.data.commitHistory} lookbackDays={lookbackDays} />
                        </Card>
                      ) : null
                    ) : null}
                    {wid === "documentation" ? (
                      confluence.loading ? (
                        <CardSkeleton lines={5} />
                      ) : confluence.data ? (
                        <Card>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <BookOpen size={16} className="text-[var(--primary)]" />
                              <h3 className="text-sm font-semibold text-[var(--on-surface)]">Documentation</h3>
                            </div>
                            <span className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider">Recent</span>
                          </div>
                          <ConfluenceSection docs={confluence.data.confluenceDocs} activity={confluence.data.confluenceActivity} />
                        </Card>
                      ) : null
                    ) : null}
                  </Fragment>
                );
              })}
            </div>

            <DashboardCustomizeDialog open={customizeOpen} onClose={() => setCustomizeOpen(false)} onSaved={reloadLayout} />

            {reportOpen ? (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
                <div className="bg-[var(--surface-container-highest)] rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-[var(--outline-variant)]/30">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--outline-variant)]/20">
                    <h2 className="text-sm font-semibold text-[var(--on-surface)]">Weekly report (Markdown)</h2>
                    <button
                      type="button"
                      onClick={() => setReportOpen(false)}
                      className="text-xs font-label text-[var(--primary)]"
                    >
                      Close
                    </button>
                  </div>
                  <textarea
                    readOnly
                    className="flex-1 min-h-[240px] m-3 p-3 rounded-md bg-[var(--surface-container)] text-xs font-mono text-[var(--on-surface)] border border-[var(--outline-variant)]/20"
                    value={reportMd}
                  />
                  <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--outline-variant)]/20">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(reportMd);
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-label rounded-md bg-[var(--primary)] text-[var(--on-primary)]"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
