"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@/lib/api";
import { useContextMenu } from "@/hooks/useContextMenu";
import { notificationSourceGroupReminderMenuContext } from "@/lib/reminder-context";
import type { NotificationGroup, NotificationsGroupedResponse } from "@/lib/types";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { showContextMenu } = useContextMenu();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<NotificationsGroupedResponse>("notifications:list-grouped");
      setGroups(res.groups);
      setTotalUnreadCount(res.totalUnreadCount);
    } catch {
      setGroups([]);
      setTotalUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsubChanged = window.electron.onNotificationsChanged(() => {
      void load();
    });
    const unsubOpen = window.electron.onNotificationOpen(async ({ id }) => {
      const record = await invoke<{ notificationType: string } | null>("notifications:get", { id });
      if (record) {
        await invoke("notifications:mark-read", { id });
        void load();
        setOpen(false);
        navigate(`/notifications?group=${encodeURIComponent(record.notificationType)}`);
      }
    });
    return () => {
      unsubChanged();
      unsubOpen();
    };
  }, [load, navigate]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function markAllRead() {
    await invoke("notifications:mark-all-read");
    void load();
  }

  function navigateToGroup(notificationType: string) {
    setOpen(false);
    navigate(`/notifications?group=${encodeURIComponent(notificationType)}`);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-[var(--surface-container-high)] transition-colors text-[var(--on-surface-variant)]"
        title="Notifications"
      >
        <Bell size={16} />
        {totalUnreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[var(--error)] text-white text-[9px] font-bold leading-4 text-center">
            {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-[var(--surface-container-highest)] rounded-md shadow-lg overflow-hidden border border-[var(--outline-variant)]/30 z-40">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--outline-variant)]/20">
            <h3 className="text-sm font-semibold text-[var(--on-surface)]">Notifications</h3>
            <button
              onClick={() => void markAllRead()}
              disabled={totalUnreadCount === 0}
              className="text-xs font-label text-[var(--primary)] disabled:text-[var(--on-surface-variant)]/50"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">Loading...</p>
            ) : groups.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">No notifications yet.</p>
            ) : (
              groups.flatMap((g) =>
                g.sourceGroups.map((sg) => (
                  <button
                    key={`${g.notificationType}::${sg.sourceItemKey}`}
                    onClick={() => navigateToGroup(g.notificationType)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const ctx = notificationSourceGroupReminderMenuContext(g.integration, sg);
                      if (!ctx) return;
                      showContextMenu({
                        title: ctx.title,
                        url: ctx.url,
                        itemType: ctx.itemType,
                        notificationId: ctx.notificationId,
                      });
                    }}
                    className="w-full text-left px-3 py-2 border-b border-[var(--outline-variant)]/10 hover:bg-[var(--surface-bright)] transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--on-surface)] truncate">{sg.sourceLabel}</p>
                      <p className="text-[10px] font-label text-[var(--on-surface-variant)]/60 capitalize mt-0.5">
                        {g.label} · {g.integration}
                        {sg.count > 1 ? ` · ${sg.count} updates` : ""}
                      </p>
                    </div>
                    {sg.unreadCount > 0 && (
                      <span className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-[var(--error)] text-white text-[9px] font-bold leading-4 text-center">
                        {sg.unreadCount}
                      </span>
                    )}
                  </button>
                ))
              )
            )}
          </div>

          <div className="px-3 py-2 border-t border-[var(--outline-variant)]/20">
            <button
              onClick={() => {
                setOpen(false);
                navigate("/notifications");
              }}
              className="text-xs font-label text-[var(--primary)] hover:underline"
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
