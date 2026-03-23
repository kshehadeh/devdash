import { useState, useEffect, useCallback } from "react";
import { Github, BookOpen, Calendar, Ticket, RefreshCw } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { MetricsBar } from "@/components/dashboard/MetricsBar";
import { CommitHeatmap } from "@/components/dashboard/CommitHeatmap";
import { PullRequestList } from "@/components/dashboard/PullRequestList";
import { ConfluenceSection } from "@/components/dashboard/ConfluenceSection";
import { EffortDistribution } from "@/components/dashboard/EffortDistribution";
import { JiraTicketList } from "@/components/dashboard/JiraTicketList";
import { invoke, useIpc } from "@/lib/api";
import { useAppStatus } from "@/context/AppStatusContext";
import { useSelectedDeveloper } from "@/context/SelectedDeveloperContext";
import type {
  Developer,
  GithubStatsResponse,
  VelocityStatsResponse,
  TicketsStatsResponse,
  ConfluenceStatsResponse,
} from "@/lib/types";

const LOOKBACK_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
];

export default function DashboardPage() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const { selectedDevId, setSelectedDevId } = useSelectedDeveloper();
  const [lookbackDays, setLookbackDays] = useState<number>(() => {
    const stored = localStorage.getItem("devdash.lookbackDays");
    return stored ? parseInt(stored, 10) : 30;
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { syncing, refreshSyncStatus } = useAppStatus();

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
  }, []);

  useEffect(() => {
    fetchDevelopers();
  }, [fetchDevelopers]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await invoke("sync:trigger", { developerId: selectedDevId });
      await new Promise((r) => setTimeout(r, 400));
      await refreshSyncStatus();
    } catch (err) {
      console.error("Failed to trigger sync:", err);
    } finally {
      setRefreshing(false);
    }
  }, [selectedDevId, refreshSyncStatus]);

  const github = useIpc<GithubStatsResponse>(selectedDevId ? "stats:code" : null, [{ developerId: selectedDevId, days: lookbackDays }]);
  const velocity = useIpc<VelocityStatsResponse>(selectedDevId ? "stats:velocity" : null, [{ developerId: selectedDevId, days: lookbackDays }]);
  const tickets = useIpc<TicketsStatsResponse>(selectedDevId ? "stats:work" : null, [{ developerId: selectedDevId, days: lookbackDays }]);
  const confluence = useIpc<ConfluenceStatsResponse>(selectedDevId ? "stats:docs" : null, [{ developerId: selectedDevId, days: lookbackDays }]);

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
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing || syncing}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[var(--surface-container-high)] transition-colors disabled:opacity-40"
                  title="Sync data from connected integrations"
                >
                  <RefreshCw size={14} className={`text-[var(--on-surface-variant)] ${refreshing || syncing ? "animate-spin" : ""}`} />
                  <span className="text-[10px] font-label text-[var(--on-surface-variant)]">Sync</span>
                </button>

                <div className="w-px h-4 bg-[var(--outline-variant)]/30" />

                <Calendar size={14} className="text-[var(--on-surface-variant)]" />
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

            <MetricsBar
              lookbackDays={lookbackDays}
              velocity={velocity.data}
              tickets={tickets.data}
              confluence={confluence.data}
              velocityLoading={velocity.loading}
              ticketsLoading={tickets.loading}
              confluenceLoading={confluence.loading}
            />

            <div className="mt-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Pull Requests */}
                {github.loading ? (
                  <CardSkeleton lines={5} />
                ) : github.data ? (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Github size={16} className="text-[var(--primary)]" />
                        <h3 className="text-sm font-semibold text-[var(--on-surface)]">
                          Pull Requests
                        </h3>
                        {github.data.pullRequests.length > 0 && (
                          <span className="text-[10px] font-label font-bold bg-[var(--primary-container)] text-[var(--on-primary)] px-1.5 py-0.5 rounded-full">
                            {github.data.pullRequests.length}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-label text-[var(--on-surface-variant)]">
                        Last {lookbackDays} days
                      </span>
                    </div>
                    <PullRequestList prs={github.data.pullRequests} />
                  </Card>
                ) : null}

                {/* Open Tickets */}
                {tickets.loading ? (
                  <CardSkeleton lines={5} />
                ) : tickets.data ? (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Ticket size={16} className="text-[var(--primary)]" />
                        <h3 className="text-sm font-semibold text-[var(--on-surface)]">
                          {(developers.find((d) => d.id === selectedDevId)?.name.split(" ")[0] ?? "Open")}{" "}
                          {tickets.data?.providerId === "linear" ? "Linear issues" : "Tickets"}
                        </h3>
                        {tickets.data.jiraTickets.length > 0 && (
                          <span className="text-[10px] font-label font-bold bg-[var(--primary-container)] text-[var(--on-primary)] px-1.5 py-0.5 rounded-full">
                            {tickets.data.jiraTickets.length}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
                        Last {lookbackDays} days
                      </span>
                    </div>
                    <JiraTicketList tickets={tickets.data.jiraTickets} />
                  </Card>
                ) : null}
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3">
                  {/* GitHub Contributions Heatmap */}
                  {github.loading ? (
                    <CardSkeleton lines={8} />
                  ) : github.data ? (
                    <Card>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Github size={16} className="text-[var(--primary)]" />
                          <h3 className="text-sm font-semibold text-[var(--on-surface)]">
                            GitHub Contributions
                          </h3>
                        </div>
                        <span className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
                          Heatmap: 1 year
                        </span>
                      </div>
                      <CommitHeatmap commits={github.data.commitHistory} totalYTD={github.data.commitsYTD} />
                    </Card>
                  ) : null}
                </div>

                <div className="flex flex-col gap-4">
                  {/* Confluence */}
                  {confluence.loading ? (
                    <CardSkeleton lines={5} />
                  ) : confluence.data ? (
                    <Card>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <BookOpen size={16} className="text-[var(--primary)]" />
                          <h3 className="text-sm font-semibold text-[var(--on-surface)]">
                            Documentation
                          </h3>
                        </div>
                        <span className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
                          Recent
                        </span>
                      </div>
                      <ConfluenceSection docs={confluence.data.confluenceDocs} activity={confluence.data.confluenceActivity} />
                    </Card>
                  ) : null}

                  {/* Effort Distribution */}
                  {github.loading ? (
                    <CardSkeleton lines={3} />
                  ) : github.data ? (
                    <Card>
                      <EffortDistribution distribution={github.data.effortDistribution} />
                    </Card>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
