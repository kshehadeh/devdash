"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Github, Kanban, BookOpen, Rocket, Calendar, Ticket } from "lucide-react";
import { TopBar } from "./components/layout/TopBar";
import { Card } from "./components/ui/Card";
import { CardSkeleton } from "./components/ui/CardSkeleton";
import { MetricsBar } from "./components/dashboard/MetricsBar";
import { CommitHeatmap } from "./components/dashboard/CommitHeatmap";
import { PullRequestList } from "./components/dashboard/PullRequestList";
import { SprintTracker } from "./components/dashboard/SprintTracker";
import { ConfluenceSection } from "./components/dashboard/ConfluenceSection";
import { EffortDistribution } from "./components/dashboard/EffortDistribution";
import { PerformanceProjection } from "./components/dashboard/PerformanceProjection";
import { JiraTicketList } from "./components/dashboard/JiraTicketList";
import { useSectionFetch } from "./hooks/useSectionFetch";
import type {
  Developer,
  GithubStatsResponse,
  VelocityStatsResponse,
  SprintStatsResponse,
  TicketsStatsResponse,
  ConfluenceStatsResponse,
} from "../lib/types";

const LOOKBACK_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
];

function computeTrajectory(
  velocity: VelocityStatsResponse | null,
): "exceptional" | "strong" | "on_track" | "needs_improvement" {
  if (!velocity) return "on_track";
  if (velocity.velocityChange > 15 && velocity.mergeRatio > 90) return "exceptional";
  if (velocity.velocityChange > 5 && velocity.mergeRatio > 80) return "strong";
  if (velocity.velocityChange < -10) return "needs_improvement";
  return "on_track";
}

export default function DashboardPage() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [selectedDevId, setSelectedDevId] = useState<string>("");
  const [lookbackDays, setLookbackDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const fetchDevelopers = useCallback(async () => {
    try {
      const res = await fetch("/api/developers");
      if (!res.ok) return;
      const data = await res.json();
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

  const baseUrl = selectedDevId ? `/api/developers/${selectedDevId}/stats` : null;
  const daysSuffix = `?days=${lookbackDays}`;

  const githubUrl = useMemo(() => baseUrl ? `${baseUrl}/github${daysSuffix}` : null, [baseUrl, daysSuffix]);
  const velocityUrl = useMemo(() => baseUrl ? `${baseUrl}/velocity${daysSuffix}` : null, [baseUrl, daysSuffix]);
  const sprintUrl = useMemo(() => baseUrl ? `${baseUrl}/sprint${daysSuffix}` : null, [baseUrl, daysSuffix]);
  const ticketsUrl = useMemo(() => baseUrl ? `${baseUrl}/tickets${daysSuffix}` : null, [baseUrl, daysSuffix]);
  const confluenceUrl = useMemo(() => baseUrl ? `${baseUrl}/confluence${daysSuffix}` : null, [baseUrl, daysSuffix]);

  const github = useSectionFetch<GithubStatsResponse>(githubUrl);
  const velocity = useSectionFetch<VelocityStatsResponse>(velocityUrl);
  const sprint = useSectionFetch<SprintStatsResponse>(sprintUrl);
  const tickets = useSectionFetch<TicketsStatsResponse>(ticketsUrl);
  const confluence = useSectionFetch<ConfluenceStatsResponse>(confluenceUrl);

  const trajectory = computeTrajectory(velocity.data);

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
                  Performance metrics across GitHub, Jira &amp; Confluence
                </p>
              </div>
              <div className="flex items-center gap-2">
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

            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="col-span-2 flex flex-col gap-4">
                {/* GitHub Contributions */}
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
                    <div className="mt-5 border-t border-[var(--outline-variant)]/20 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
                          Pull Requests
                        </span>
                        <span className="text-[10px] font-label text-[var(--on-surface-variant)]">
                          Last {lookbackDays} days
                        </span>
                      </div>
                      <PullRequestList prs={github.data.pullRequests} />
                    </div>
                  </Card>
                ) : null}

                {/* Sprint Tracker */}
                {sprint.loading ? (
                  <CardSkeleton lines={6} />
                ) : sprint.data ? (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Kanban size={16} className="text-[var(--primary)]" />
                        <h3 className="text-sm font-semibold text-[var(--on-surface)]">
                          Active Sprint: {sprint.data.sprint.name}
                        </h3>
                      </div>
                      <span className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
                        Current
                      </span>
                    </div>
                    <SprintTracker sprint={sprint.data.sprint} />
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
                          My Open Tickets
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
                          Confluence
                        </h3>
                      </div>
                      <span className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
                        Recent
                      </span>
                    </div>
                    <ConfluenceSection docs={confluence.data.confluenceDocs} activity={confluence.data.confluenceActivity} />
                  </Card>
                ) : null}

                {/* Performance Projection */}
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <Rocket size={16} className="text-[var(--tertiary)]" />
                    <h3 className="text-sm font-semibold text-[var(--on-surface)]">System Status</h3>
                  </div>
                  <PerformanceProjection trajectory={trajectory} />
                </Card>

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
          </>
        )}
      </main>
    </div>
  );
}
