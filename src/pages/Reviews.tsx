import { useState, useEffect, useCallback, useRef } from "react";
import { ExternalLink, Eye, Github } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { invoke, useIpc } from "@/lib/api";
import { useSelectedDeveloper } from "@/context/SelectedDeveloperContext";
import type { Developer, MyPRReviewItem, PullReviewState, ReviewRequestItem, ReviewsResponse } from "@/lib/types";

function reviewStateBadge(state: PullReviewState) {
  if (!state) return null;
  const labels: Record<Exclude<PullReviewState, null>, string> = {
    APPROVED: "Approved",
    CHANGES_REQUESTED: "Changes requested",
    COMMENTED: "Commented",
  };
  const variants: Record<Exclude<PullReviewState, null>, "success" | "error" | "neutral"> = {
    APPROVED: "success",
    CHANGES_REQUESTED: "error",
    COMMENTED: "neutral",
  };
  return <Badge variant={variants[state]}>{labels[state]}</Badge>;
}

function RequestedRow({ item }: { item: ReviewRequestItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-3 py-3 rounded-md hover:bg-[var(--surface-container-high)] transition-colors group"
    >
      <Github size={16} className="shrink-0 mt-0.5 text-[var(--primary)]" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--on-surface)] truncate group-hover:text-[var(--primary)]">{item.title}</p>
        <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
          <span className="font-mono">{item.repo}</span>
          <span className="mx-1">·</span>#{item.number}
          <span className="mx-1">·</span>
          <span className="text-[var(--on-surface-variant)]">@{item.authorLogin}</span>
          <span className="mx-1">·</span>
          {item.timeAgo}
        </p>
      </div>
      <ExternalLink size={14} className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--on-surface-variant)] mt-1" />
    </a>
  );
}

function MyPRRow({ item }: { item: MyPRReviewItem }) {
  const pending =
    item.pendingReviewerLogins.length > 0
      ? `Waiting on: ${item.pendingReviewerLogins.join(", ")}`
      : null;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-3 py-3 rounded-md hover:bg-[var(--surface-container-high)] transition-colors group"
    >
      <Github size={16} className="shrink-0 mt-0.5 text-[var(--primary)]" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 gap-y-1">
          <p className="text-sm text-[var(--on-surface)] truncate max-w-full group-hover:text-[var(--primary)]">{item.title}</p>
          {reviewStateBadge(item.latestReviewState)}
        </div>
        <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
          <span className="font-mono">{item.repo}</span>
          <span className="mx-1">·</span>#{item.number}
          <span className="mx-1">·</span>
          {item.reviewCount} {item.reviewCount === 1 ? "review" : "reviews"}
          <span className="mx-1">·</span>
          {item.timeAgo}
        </p>
        {pending ? <p className="text-[10px] font-label text-[var(--on-surface-variant)] mt-1 uppercase tracking-wide">{pending}</p> : null}
      </div>
      <ExternalLink size={14} className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--on-surface-variant)] mt-1" />
    </a>
  );
}

export default function ReviewsPage() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const { selectedDevId, setSelectedDevId } = useSelectedDeveloper();
  const [loadingDevs, setLoadingDevs] = useState(true);

  const fetchDevelopers = useCallback(async () => {
    try {
      const data = await invoke<Developer[]>("developers:list");
      if (!Array.isArray(data)) return;
      setDevelopers(data);
      if (data.length > 0) {
        setSelectedDevId((prev) => (data.find((d) => d.id === prev) ? prev : data[0].id));
      }
    } catch (err) {
      console.error("Failed to fetch developers:", err);
    } finally {
      setLoadingDevs(false);
    }
  }, []);

  useEffect(() => {
    fetchDevelopers();
  }, [fetchDevelopers]);

  const reviews = useIpc<ReviewsResponse>(selectedDevId ? "reviews:get" : null, [{ developerId: selectedDevId }]);

  const pollCount = useRef(0);
  useEffect(() => {
    if (!selectedDevId || reviews.loading) return;
    if (reviews.data?._syncedAt || reviews.data?.error) return;
    pollCount.current = 0;
    const id = window.setInterval(() => {
      pollCount.current += 1;
      reviews.refresh();
      if (pollCount.current >= 30) window.clearInterval(id);
    }, 2000);
    return () => window.clearInterval(id);
  }, [selectedDevId, reviews.loading, reviews.data?._syncedAt, reviews.data?.error, reviews.refresh]);

  const hasNoDev = developers.length === 0;
  const noDevSelected = !selectedDevId;

  if (loadingDevs) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
          <span className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">Reviews</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-[var(--surface)]">
          <span className="text-sm text-[var(--on-surface-variant)]">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        developers={developers}
        selectedId={selectedDevId}
        onSelect={setSelectedDevId}
        onDevelopersChange={fetchDevelopers}
        title="Reviews"
      />

      <main className="flex-1 overflow-y-auto p-6 bg-[var(--surface)]">
        {hasNoDev || noDevSelected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Eye size={32} className="text-[var(--on-surface-variant)] opacity-50" />
            <p className="text-[var(--on-surface-variant)]">
              {hasNoDev ? "Add a developer to track review work." : "Select a developer to view their reviews."}
            </p>
          </div>
        ) : reviews.loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardSkeleton lines={6} />
            <CardSkeleton lines={6} />
          </div>
        ) : reviews.error ? (
          <p className="text-sm text-[var(--error)]">{reviews.error}</p>
        ) : reviews.data ? (
          <>
            {reviews.data.error ? (
              <div className="mb-4 rounded-md px-3 py-2 text-sm bg-[var(--error_container)] text-[var(--error)]">{reviews.data.error}</div>
            ) : null}

            <div className="mb-5">
              <h2 className="text-xl font-bold text-[var(--on-surface)] mb-1">Code review queue</h2>
              <p className="text-xs font-label text-[var(--on-surface-variant)]">
                From cached GitHub data (same sync as dashboard pull requests). Reviews waiting on you and status on your open PRs.
              </p>
              {!reviews.data.error && !reviews.data._syncedAt ? (
                <p className="text-xs text-[var(--on-surface-variant)] mt-2">
                  Lists appear after pull requests finish syncing. Open the dashboard and use Sync, or wait for background sync.
                </p>
              ) : null}
              {reviews.data._syncedAt ? (
                <p className="text-[10px] font-label text-[var(--on-surface-variant)] mt-2 uppercase tracking-wider">
                  Cache updated {new Date(reviews.data._syncedAt).toLocaleString()}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <Eye size={16} className="text-[var(--primary)]" />
                  <h3 className="text-sm font-semibold text-[var(--on-surface)]">Requested of you</h3>
                  {reviews.data.requestedOfYou.length > 0 ? (
                    <span className="text-[10px] font-label font-bold bg-[var(--primary-container)] text-[var(--on-primary)] px-1.5 py-0.5 rounded-full">
                      {reviews.data.requestedOfYou.length}
                    </span>
                  ) : null}
                </div>
                <p className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                  Open PRs where you were directly requested (not only via a team)
                </p>
                {reviews.data.requestedOfYou.length === 0 ? (
                  <p className="text-sm text-[var(--on-surface-variant)] py-2">No pending review requests.</p>
                ) : (
                  <div className="flex flex-col gap-0.5 -mx-1">
                    {reviews.data.requestedOfYou.map((item) => (
                      <RequestedRow key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <Github size={16} className="text-[var(--primary)]" />
                  <h3 className="text-sm font-semibold text-[var(--on-surface)]">On your pull requests</h3>
                  {reviews.data.onYourPullRequests.length > 0 ? (
                    <span className="text-[10px] font-label font-bold bg-[var(--primary-container)] text-[var(--on-primary)] px-1.5 py-0.5 rounded-full">
                      {reviews.data.onYourPullRequests.length}
                    </span>
                  ) : null}
                </div>
                <p className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                  Your open PRs and review status
                </p>
                {reviews.data.onYourPullRequests.length === 0 ? (
                  <p className="text-sm text-[var(--on-surface-variant)] py-2">No open pull requests.</p>
                ) : (
                  <div className="flex flex-col gap-0.5 -mx-1">
                    {reviews.data.onYourPullRequests.map((item) => (
                      <MyPRRow key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
