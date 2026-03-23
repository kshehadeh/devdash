"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, ExternalLink } from "lucide-react";
import { invoke } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import type { NotificationRecord, NotificationsListResponse } from "@/lib/types";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selected, setSelected] = useState<NotificationRecord | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<NotificationsListResponse>("notifications:list", { limit: 50 });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const unsubChanged = window.electron.onNotificationsChanged(() => {
      void loadNotifications();
    });
    const unsubOpen = window.electron.onNotificationOpen(async ({ id }) => {
      const record = await invoke<NotificationRecord | null>("notifications:get", { id });
      if (!record) return;
      if (record.status === "new") {
        await invoke("notifications:mark-read", { id: record.id });
      }
      setSelected({ ...record, status: "read", readAt: new Date().toISOString() });
      setOpen(false);
      void loadNotifications();
    });
    return () => {
      unsubChanged();
      unsubOpen();
    };
  }, [loadNotifications]);

  const hasNotifications = notifications.length > 0;
  const sorted = useMemo(() => notifications, [notifications]);

  async function openNotification(notification: NotificationRecord) {
    if (notification.status === "new") {
      await invoke("notifications:mark-read", { id: notification.id });
    }
    setSelected({ ...notification, status: "read", readAt: new Date().toISOString() });
    setOpen(false);
    void loadNotifications();
  }

  async function markAllRead() {
    await invoke("notifications:mark-all-read");
    void loadNotifications();
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative p-2 rounded-md hover:bg-[var(--surface-container-high)] transition-colors text-[var(--on-surface-variant)]"
          title="Notifications"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[var(--error)] text-white text-[9px] font-bold leading-4 text-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-96 max-h-[420px] bg-[var(--surface-container-highest)] rounded-md shadow-lg overflow-hidden border border-[var(--outline-variant)]/30 z-40">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--outline-variant)]/20">
              <h3 className="text-sm font-semibold text-[var(--on-surface)]">Notifications</h3>
              <button
                onClick={() => void markAllRead()}
                disabled={unreadCount === 0}
                className="text-xs font-label text-[var(--primary)] disabled:text-[var(--on-surface-variant)]/50"
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {loading ? (
                <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">Loading...</p>
              ) : !hasNotifications ? (
                <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">No notifications yet.</p>
              ) : (
                sorted.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => void openNotification(n)}
                    className="w-full text-left px-3 py-2.5 border-b border-[var(--outline-variant)]/10 hover:bg-[var(--surface-bright)] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-[var(--on-surface)] truncate">{n.title}</p>
                      {n.status === "new" ? (
                        <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
                      ) : (
                        <Check size={12} className="text-[var(--on-surface-variant)] shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-[var(--on-surface-variant)] truncate mt-0.5">{n.body}</p>
                    <p className="text-[10px] font-label text-[var(--on-surface-variant)]/80 mt-1">{formatWhen(n.createdAt)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? "Notification"}>
        {selected && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--on-surface)]">{selected.body}</p>
            <div className="text-xs text-[var(--on-surface-variant)] font-label">
              <p>Integration: {selected.integration}</p>
              <p>Type: {selected.notificationType}</p>
              <p>Event Time: {formatWhen(selected.eventUpdatedAt)}</p>
              <p>Received: {formatWhen(selected.createdAt)}</p>
            </div>
            {selected.sourceUrl && (
              <button
                type="button"
                onClick={() => window.open(selected.sourceUrl ?? "")}
                className="inline-flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-md bg-[var(--surface-container-high)] text-[var(--on-surface)] text-xs font-semibold hover:bg-[var(--surface-container-highest)]"
              >
                Open Source
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
