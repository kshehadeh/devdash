import { useEffect, useState, useCallback } from "react";
import { GitMerge, Ticket, ExternalLink, RefreshCw, Loader2, Settings } from "lucide-react";

interface TrayItem {
  type: "pr" | "ticket";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  createdAt: string;
}

interface TrayItemsResponse {
  items: TrayItem[];
  error?: string;
}

declare global {
  interface Window {
    trayShell: {
      getItems: () => Promise<TrayItemsResponse>;
      openExternal: (url: string) => Promise<void>;
      focusMain: () => Promise<void>;
      openSettings: () => Promise<void>;
    };
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "";
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(ms / 60000);
  return `${m}m`;
}

function TrayItemRow({ item }: { item: TrayItem }) {
  const isPr = item.type === "pr";

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    window.trayShell?.openExternal(item.url).catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-start gap-2.5 px-3 py-2 rounded-md hover:bg-white/8 transition-colors group text-left"
    >
      {isPr ? (
        <GitMerge size={14} className="text-emerald-400 shrink-0 mt-0.5" />
      ) : (
        <Ticket size={14} className="text-[#818cf8] shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-white/90 truncate leading-snug">{item.title}</div>
        <div className="text-[11px] text-white/40 truncate mt-0.5">{item.subtitle}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <span className="text-[11px] text-white/40">{timeAgo(item.createdAt)}</span>
        <ExternalLink
          size={11}
          className="text-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </button>
  );
}

export default function TrayPopover() {
  const [items, setItems] = useState<TrayItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!window.trayShell) return;
    try {
      const res = await window.trayShell.getItems();
      setItems(res.items);
      setError(res.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const prs = items.filter((i) => i.type === "pr");
  const tickets = items.filter((i) => i.type === "ticket");

  function handleOpenDevDash() {
    window.trayShell?.focusMain().catch(() => {});
  }

  return (
    <div
      className="flex flex-col h-screen bg-[#0f1117] text-white select-none overflow-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/8 shrink-0">
        <span className="text-[13px] font-semibold text-white/80">DevDash</span>
        <button
          type="button"
          onClick={() => void load()}
          className="text-white/30 hover:text-white/60 transition-colors p-0.5 rounded"
          title="Refresh"
        >
          {loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {error && !loading && (
          <p className="px-3 py-4 text-[12px] text-white/40 text-center">{error}</p>
        )}

        {!error && !loading && items.length === 0 && (
          <p className="px-3 py-8 text-[12px] text-white/40 text-center">No open PRs or tickets.</p>
        )}

        {prs.length > 0 && (
          <div className="pt-2">
            <div className="px-3 pb-1">
              <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                Pull Requests ({prs.length})
              </span>
            </div>
            {prs.map((item) => (
              <TrayItemRow key={item.id} item={item} />
            ))}
          </div>
        )}

        {tickets.length > 0 && (
          <div className="pt-2">
            <div className="px-3 pb-1">
              <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                Tickets ({tickets.length})
              </span>
            </div>
            {tickets.map((item) => (
              <TrayItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-2 border-t border-white/8 flex items-center justify-between">
        <button
          type="button"
          onClick={handleOpenDevDash}
          className="text-[12px] text-white/40 hover:text-white/70 transition-colors py-0.5"
        >
          Open DevDash
        </button>
        <button
          type="button"
          onClick={() => window.trayShell?.openSettings().catch(() => {})}
          className="text-white/30 hover:text-white/60 transition-colors p-0.5 rounded"
          title="Settings"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
}
