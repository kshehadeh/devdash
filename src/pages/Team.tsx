import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { invoke } from "@/lib/api";
import { useSelectedDeveloper } from "@/context/SelectedDeveloperContext";
import type { Developer, TeamOverviewResponse } from "@/lib/types";

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

export default function TeamPage() {
  const navigate = useNavigate();
  const { selectedDevId, setSelectedDevId } = useSelectedDeveloper();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<TeamOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<TeamOverviewResponse>("stats:team-overview", { days })
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load team stats"))
      .finally(() => setLoading(false));
  }, [days]);

  function openDeveloper(developerId: string) {
    setSelectedDevId(developerId);
    navigate("/");
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
            <table className="w-full text-left text-xs min-w-[720px]">
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
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.developerId}
                    className="border-b border-[var(--outline-variant)]/10 hover:bg-[var(--surface-container-high)] cursor-pointer transition-colors"
                    onClick={() => openDeveloper(row.developerId)}
                  >
                    <td className="py-2.5 pr-3 font-medium text-[var(--on-surface)]">{row.name}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.velocity}</td>
                    <td className={`py-2.5 pr-3 tabular-nums ${mergeRatioColor(row.mergeRatio)}`}>{row.mergeRatio}%</td>
                    <td className={`py-2.5 pr-3 tabular-nums ${reviewHoursColor(row.reviewTurnaroundHours)}`}>
                      {row.reviewTurnaroundHours > 0 ? row.reviewTurnaroundHours : "—"}
                    </td>
                    <td className={`py-2.5 pr-3 tabular-nums ${workloadColor(row.workloadHealth)}`}>{row.workloadHealth}/10</td>
                    <td className="py-2.5 pr-3 tabular-nums text-[var(--on-surface)]">{row.ticketVelocity}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.openPrCount}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.pendingReviewCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
