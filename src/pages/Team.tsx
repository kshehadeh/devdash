import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { invoke } from "@/lib/api";
import { useSelectedDeveloper } from "@/context/SelectedDeveloperContext";
import { useAppStatus } from "@/context/AppStatusContext";
import type { Developer, TeamOverviewResponse, TeamRowDataStatus, SyncTriggerResult } from "@/lib/types";

const LOOKBACK_OPTIONS = [7, 14, 30, 60, 90];

function workloadColor(v: number): string {
  if (v >= 8) return "text-emerald-400";
  if (v >= 5) return "text-amber-400";
  return "text-red-400";
}

function mergeRatioColor(pct: number): string {
  if (pct >= 90) return "text-emerald-400";
  if (pct >= 70) return "text-[var(--primary)]";
  if (pct >= 50) return "text-amber-400";
  return "text-[var(--error)]";
}

function reviewHoursColor(h: number): string {
  if (h <= 0) return "text-[var(--on-surface-variant)]";
  if (h <= 48) return "text-emerald-400";
  if (h <= 120) return "text-[var(--primary)]";
  return "text-amber-400";
}

function formatSyncDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function dataStatusLabel(status: TeamRowDataStatus, lastSyncedAt: string | null): string {
  if (status === "no_data") return "No data";
  if (status === "stale") return `Stale ${formatSyncDate(lastSyncedAt)}`;
  return "";
}

export default function TeamPage() {
  const navigate = useNavigate();
  const { selectedDevId, setSelectedDevId } = useSelectedDeveloper();
  const { syncing } = useAppStatus();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<TeamOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingDevId, setSyncingDevId] = useState<string | null>(null);

  const fetchDevelopers = useCallback(async () => {
    try {
      const list = await invoke<Developer[]>("developers:list");
      if (!Array.isArray(list)) return;
      setDevelopers(list);
      if (list.length > 0) {
        setSelectedDevId((prev) => (list.find((d) => d.id === prev) ? prev : list[0].id));
      }
    } catch (e) {
      console.error(e);
    }
  }, [setSelectedDevId]);

  useEffect(() => {
    void fetchDevelopers();
  }, [fetchDevelopers]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<TeamOverviewResponse>("stats:team-overview", { days });
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load team stats");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Refresh team overview when sync completes
  const { subscribeSyncInvalidation } = useAppStatus();
  useEffect(() => {
    const unsub = subscribeSyncInvalidation("stats:team-overview", () => {
      void loadData();
    });
    return unsub;
  }, [subscribeSyncInvalidation, loadData]);

  function openDeveloper(developerId: string) {
    setSelectedDevId(developerId);
    navigate("/");
  }

  async function handleRowSync(developerId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSyncingDevId(developerId);
    try {
      await invoke<SyncTriggerResult>("sync:trigger", { developerId });
      // Give sync a moment to complete cache writes, then refresh team data
      await new Promise((r) => setTimeout(r, 1500));
      await loadData();
    } catch (err) {
      console.error("Row sync failed:", err);
    } finally {
      setSyncingDevId(null);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        developers={developers}
        selectedId={selectedDevId}
        onSelect={setSelectedDevId}
        onDevelopersChange={fetchDevelopers}
        title="Team"
      />
      <main className="flex-1 overflow-y-auto p-6 bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-[var(--primary)]" />
            <div>
              <h2 className="text-xl font-bold text-[var(--on-surface)]">Team overview</h2>
              <p className="text-xs font-label text-[var(--on-surface-variant)]">
                Compare tracked developers (cached GitHub / work stats). Click a row to open their dashboard.
              </p>
            </div>
          </div>
          <div className="flex bg-[var(--surface-container)] rounded-md overflow-hidden">
            {LOOKBACK_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-label font-medium transition-colors ${
                  days === d ? "bg-[var(--primary)] text-[var(--on-primary)]" : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--on-surface-variant)]">Loading…</p>
        ) : error ? (
          <p className="text-sm text-[var(--error)]">{error}</p>
        ) : !data?.rows.length ? (
          <p className="text-sm text-[var(--on-surface-variant)]">No developers to show.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[820px]">
              <thead>
                <tr className="border-b border-[var(--outline-variant)]/30 text-[var(--on-surface-variant)] font-label uppercase tracking-wider">
                  <th className="py-2 pr-3">Developer</th>
                  <th className="py-2 pr-3">Velocity</th>
                  <th className="py-2 pr-3">Merge %</th>
                  <th className="py-2 pr-3">Review 1st (h)</th>
                  <th className="py-2 pr-3">Workload</th>
                  <th className="py-2 pr-3">Tickets done</th>
                  <th className="py-2 pr-3">Open PRs</th>
                  <th className="py-2 pr-3">Reviews waiting</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const isRowSyncing = syncingDevId === row.developerId;
                  const statusLabel = dataStatusLabel(row.dataStatus, row.lastSyncedAt);
                  const isStaleOrEmpty = row.dataStatus === "stale" || row.dataStatus === "no_data";
                  return (
                    <tr
                      key={row.developerId}
                      className={clsx(
                        "border-b border-[var(--outline-variant)]/10 hover:bg-[var(--surface-container-high)] cursor-pointer transition-colors",
                        row.dataStatus === "no_data" && "opacity-60",
                      )}
                      onClick={() => openDeveloper(row.developerId)}
                    >
                      <td className="py-2.5 pr-3 font-medium text-[var(--on-surface)]">{row.name}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{isStaleOrEmpty ? "—" : row.velocity}</td>
                      <td className={clsx("py-2.5 pr-3 tabular-nums", isStaleOrEmpty ? "" : mergeRatioColor(row.mergeRatio))}>
                        {isStaleOrEmpty ? "—" : `${row.mergeRatio}%`}
                      </td>
                      <td className={clsx("py-2.5 pr-3 tabular-nums", isStaleOrEmpty ? "" : reviewHoursColor(row.reviewTurnaroundHours))}>
                        {isStaleOrEmpty ? "—" : row.reviewTurnaroundHours > 0 ? row.reviewTurnaroundHours : "—"}
                      </td>
                      <td className={clsx("py-2.5 pr-3 tabular-nums", isStaleOrEmpty ? "" : workloadColor(row.workloadHealth))}>
                        {isStaleOrEmpty ? "—" : `${row.workloadHealth}/10`}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-[var(--on-surface)]">{isStaleOrEmpty ? "—" : row.ticketVelocity}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{isStaleOrEmpty ? "—" : row.openPrCount}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{isStaleOrEmpty ? "—" : row.pendingReviewCount}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          {statusLabel && (
                            <span className={clsx(
                              "text-[10px] font-label",
                              row.dataStatus === "no_data" ? "text-[var(--on-surface-variant)]" : "text-amber-400",
                            )}>
                              {statusLabel}
                            </span>
                          )}
                          {row.dataStatus === "current" && !statusLabel && (
                            <span className="text-[10px] font-label text-emerald-400">Current</span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => void handleRowSync(row.developerId, e)}
                            disabled={isRowSyncing || syncing}
                            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--surface-container-high)] transition-colors disabled:opacity-40"
                            title={`Sync data for ${row.name}`}
                          >
                            <RefreshCw size={12} className={clsx("text-[var(--on-surface-variant)]", (isRowSyncing || syncing) && "animate-spin")} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
