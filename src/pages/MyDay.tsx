import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ClipboardCheck, ListTodo, AlarmClock, ExternalLink, Github } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { invoke, useIpc } from "@/lib/api";
import { useSelectedDeveloper } from "@/context/SelectedDeveloperContext";
import type {
  Developer,
  ReviewsResponse,
  TicketsStatsResponse,
  ReminderRecord,
  NotificationsListResponse,
} from "@/lib/types";

export default function MyDayPage() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const { selectedDevId, setSelectedDevId } = useSelectedDeveloper();
  const [loadingDevs, setLoadingDevs] = useState(true);
  const [triggeredReminders, setTriggeredReminders] = useState<ReminderRecord[]>([]);

  const fetchDevelopers = useCallback(async () => {
    try {
      const data = await invoke<Developer[]>("developers:list");
      if (!Array.isArray(data)) return;
      setDevelopers(data);
      if (data.length > 0) {
        setSelectedDevId((prev) => (data.find((d) => d.id === prev) ? prev : data[0].id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDevs(false);
    }
  }, [setSelectedDevId]);

  useEffect(() => {
    void fetchDevelopers();
  }, [fetchDevelopers]);

  const loadReminders = useCallback(async () => {
    try {
      const res = await invoke<{ reminders: ReminderRecord[] }>("reminders:list", {
        status: "triggered",
        limit: 50,
      });
      setTriggeredReminders(res.reminders ?? []);
    } catch {
      setTriggeredReminders([]);
    }
  }, []);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  useEffect(() => {
    const unsub = window.electron.onRemindersChanged(() => void loadReminders());
    return unsub;
  }, [loadReminders]);

  const reviews = useIpc<ReviewsResponse>(selectedDevId ? "reviews:get" : null, [{ developerId: selectedDevId }]);
  const tickets = useIpc<TicketsStatsResponse>(selectedDevId ? "stats:work" : null, [{ developerId: selectedDevId, days: 30 }]);
  const notif = useIpc<NotificationsListResponse>(
    selectedDevId ? "notifications:list" : null,
    [{ limit: 100 }],
  );

  const inProgress = (tickets.data?.jiraTickets ?? []).filter((t) => t.statusCategory === "in_progress");
  const unreadCount = notif.data?.unreadCount ?? 0;

  if (loadingDevs) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
          <span className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">My Day</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-[var(--surface)] text-sm text-[var(--on-surface-variant)]">Loading…</div>
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
        title="My Day"
      />
      <main className="flex-1 overflow-y-auto p-6 bg-[var(--surface)] space-y-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--on-surface)]">Today at a glance</h2>
          <p className="text-xs font-label text-[var(--on-surface-variant)] mt-1">
            Reviews waiting on you, in-progress tickets, triggered reminders, and unread notifications.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardCheck size={16} className="text-[var(--primary)]" />
              <h3 className="text-sm font-semibold text-[var(--on-surface)]">Reviews</h3>
              {reviews.data?.requestedOfYou.length ? (
                <Badge variant="primary">{reviews.data.requestedOfYou.length}</Badge>
              ) : null}
            </div>
            {reviews.loading ? (
              <p className="text-xs text-[var(--on-surface-variant)]">Loading…</p>
            ) : reviews.data?.error ? (
              <p className="text-xs text-[var(--error)]">{reviews.data.error}</p>
            ) : (reviews.data?.requestedOfYou.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">No review requests right now.</p>
            ) : (
              <ul className="space-y-2">
                {reviews.data!.requestedOfYou.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-sm text-[var(--on-surface)] hover:text-[var(--primary)] group"
                    >
                      <Github size={14} className="shrink-0 mt-0.5" />
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <ExternalLink size={12} className="shrink-0 opacity-0 group-hover:opacity-100" />
                    </a>
                    <p className="text-[10px] text-[var(--on-surface-variant)] ml-6">
                      {r.repo} #{r.number} · @{r.authorLogin}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/reviews" className="inline-block mt-3 text-xs font-label text-[var(--primary)]">
              Open review queue →
            </Link>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <ListTodo size={16} className="text-[var(--primary)]" />
              <h3 className="text-sm font-semibold text-[var(--on-surface)]">In progress</h3>
              {inProgress.length > 0 ? <Badge variant="tertiary">{inProgress.length}</Badge> : null}
            </div>
            {tickets.loading ? (
              <p className="text-xs text-[var(--on-surface-variant)]">Loading…</p>
            ) : inProgress.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">No in-progress tickets in the current list.</p>
            ) : (
              <ul className="space-y-2">
                {inProgress.slice(0, 12).map((t) => (
                  <li key={t.id}>
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--on-surface)] hover:text-[var(--primary)] flex items-center gap-2 group"
                    >
                      <span className="font-mono text-xs text-[var(--on-surface-variant)]">{t.key}</span>
                      <span className="truncate flex-1">{t.title}</span>
                      <ExternalLink size={12} className="shrink-0 opacity-0 group-hover:opacity-100" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <AlarmClock size={16} className="text-[var(--primary)]" />
              <h3 className="text-sm font-semibold text-[var(--on-surface)]">Triggered reminders</h3>
              {triggeredReminders.length > 0 ? <Badge variant="error">{triggeredReminders.length}</Badge> : null}
            </div>
            {triggeredReminders.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">None right now.</p>
            ) : (
              <ul className="space-y-2">
                {triggeredReminders.slice(0, 10).map((r) => (
                  <li key={r.id} className="text-sm text-[var(--on-surface)] truncate">
                    {r.title}
                  </li>
                ))}
              </ul>
            )}
            <Link to="/reminders?status=triggered" className="inline-block mt-3 text-xs font-label text-[var(--primary)]">
              View reminders →
            </Link>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Bell size={16} className="text-[var(--primary)]" />
              <h3 className="text-sm font-semibold text-[var(--on-surface)]">Notifications</h3>
              {unreadCount > 0 ? <Badge variant="error">{unreadCount}</Badge> : null}
            </div>
            {notif.loading ? (
              <p className="text-xs text-[var(--on-surface-variant)]">Loading…</p>
            ) : (
              <p className="text-sm text-[var(--on-surface-variant)]">
                {unreadCount === 0 ? "No unread notifications." : `${unreadCount} unread in your inbox.`}
              </p>
            )}
            <Link to="/notifications" className="inline-block mt-3 text-xs font-label text-[var(--primary)]">
              Open notifications →
            </Link>
          </Card>
        </div>
      </main>
    </div>
  );
}
