import { useState, useEffect, useCallback } from "react";
import { HardDrive, Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { invoke } from "@/lib/api";

type CacheBucketId =
  | "github_contributions"
  | "github_pull_requests"
  | "github_pr_review_comments"
  | "github_pr_approvals_given"
  | "jira_tickets"
  | "linear_issues"
  | "confluence_pages";

interface CacheBucketStats {
  id: CacheBucketId;
  label: string;
  description: string;
  rowCount: number;
  storageBytes: number | null;
}

interface CacheStatsResponse {
  buckets: CacheBucketStats[];
  databaseFileBytes: number | null;
}

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n === 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10_485_760 ? 1 : 0)} MB`;
}

export default function CachePage() {
  const [stats, setStats] = useState<CacheStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<CacheBucketId | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await invoke<CacheStatsResponse>("cache:stats");
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cache stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clear = async (bucketId: CacheBucketId | "all") => {
    const msg =
      bucketId === "all"
        ? "Clear all local sync caches? The next sync will refetch everything from scratch (incremental cursors are reset)."
        : "Clear this cache and reset its sync cursor? The next sync will refetch this data from scratch.";
    if (!window.confirm(msg)) return;

    setBusyId(bucketId);
    setError(null);
    try {
      const data = await invoke<CacheStatsResponse>("cache:clear", { bucketId });
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear cache");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6">
      {loading ? (
        <div className="text-sm text-[var(--on-surface-variant)]">Loading...</div>
      ) : (
        <div className="max-w-2xl flex flex-col gap-5">
          <Card>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <HardDrive size={18} className="text-[var(--on-surface)] shrink-0" />
                <h3 className="text-base font-semibold text-[var(--on-surface)]">Local sync cache</h3>
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => clear("all")}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--surface-container-high)] text-[var(--error)] hover:bg-[var(--surface-container-highest)] disabled:opacity-50 transition-colors"
              >
                {busyId === "all" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Clear all
              </button>
            </div>
            <p className="text-xs font-label text-[var(--on-surface-variant)] mb-1">
              Cached API results per integration. Clearing removes stored rows and the matching{" "}
              <code className="text-[var(--primary)] bg-[var(--surface-container-highest)] px-1 py-0.5 rounded text-[11px]">
                sync_log
              </code>{" "}
              entry so incremental{" "}
              <code className="text-[var(--primary)] bg-[var(--surface-container-highest)] px-1 py-0.5 rounded text-[11px]">
                last_cursor
              </code>{" "}
              values are dropped; the following sync runs a full refresh for that pipeline.
            </p>
            {stats?.databaseFileBytes != null && stats.databaseFileBytes > 0 && (
              <p className="text-[10px] font-label text-[var(--on-surface-variant)]/80 mt-2">
                SQLite file (all tables): {formatBytes(stats.databaseFileBytes)}
              </p>
            )}
            {error && (
              <p className="text-xs text-[var(--error)] bg-[var(--error)]/10 px-3 py-2 rounded-md mt-3">{error}</p>
            )}
          </Card>

          <div className="flex flex-col gap-3">
            {stats?.buckets.map((b) => (
              <Card key={b.id} elevated>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[var(--on-surface)]">{b.label}</div>
                    <p className="text-xs font-label text-[var(--on-surface-variant)] mt-1">{b.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] font-label text-[var(--on-surface-variant)]">
                      <span>
                        Rows: <span className="text-[var(--on-surface)] tabular-nums">{b.rowCount.toLocaleString()}</span>
                      </span>
                      <span>
                        Approx. storage:{" "}
                        <span className="text-[var(--on-surface)] tabular-nums">{formatBytes(b.storageBytes)}</span>
                        {b.storageBytes === null && (
                          <span className="text-[var(--on-surface-variant)]/70"> (dbstat unavailable)</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => clear(b.id)}
                    className="shrink-0 self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--outline-variant)]/40 text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)] disabled:opacity-50 transition-colors"
                  >
                    {busyId === b.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Clear
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
