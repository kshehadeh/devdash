"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, ChevronDown, ChevronRight, ExternalLink, RefreshCw, AlarmClock } from "lucide-react";
import { clsx } from "clsx";
import { invoke } from "@/lib/api";
import { ReminderDialog } from "@/components/reminders/ReminderDialog";
import type { NotificationGroup, NotificationRecord, NotificationSourceGroup, NotificationsGroupedResponse } from "@/lib/types";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

function getNotificationSubtext(n: NotificationRecord): string | null {
  const { notificationType, body, payload } = n;
  switch (notificationType) {
    case "review_requested": {
      const author = typeof payload.authorLogin === "string" ? payload.authorLogin : null;
      return author ? `Requested by @${author}` : null;
    }
    case "assigned_or_watched_ticket_updated": {
      const status = typeof payload.status === "string" ? payload.status : null;
      return status ?? null;
    }
    case "page_activity": {
      const timeAgo = typeof payload.timeAgo === "string" ? payload.timeAgo : null;
      return timeAgo ?? (body || null);
    }
    default:
      return body || null;
  }
}

function integrationBadgeClass(integration: string): string {
  switch (integration) {
    case "github":
      return "text-[var(--primary)] bg-[var(--primary)]/10";
    case "jira":
      return "text-blue-400 bg-blue-400/10";
    case "confluence":
      return "text-teal-400 bg-teal-400/10";
    default:
      return "text-[var(--on-surface-variant)] bg-[var(--surface-container-high)]";
  }
}

export default function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Tracks expanded source-item sub-groups: "notificationType::sourceItemKey"
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const contentRef = useRef<HTMLDivElement>(null);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderForNotification, setReminderForNotification] = useState<NotificationRecord | null>(null);

  const groupParam = searchParams.get("group");

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
    const unsub = window.electron.onNotificationsChanged(() => {
      void load();
    });
    return unsub;
  }, [load]);

  // Expand and scroll to group from URL param
  useEffect(() => {
    if (!groupParam || loading) return;
    setExpanded((prev) => new Set([...prev, groupParam]));
    const el = sectionRefs.current.get(groupParam);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [groupParam, loading]);

  function toggleExpand(notificationType: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(notificationType)) next.delete(notificationType);
      else next.add(notificationType);
      return next;
    });
  }

  function toggleExpandSource(notificationType: string, sourceItemKey: string) {
    const key = `${notificationType}::${sourceItemKey}`;
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isSourceExpanded(notificationType: string, sourceItemKey: string) {
    return expandedSources.has(`${notificationType}::${sourceItemKey}`);
  }

  function scrollToGroup(notificationType: string) {
    setSearchParams({ group: notificationType });
    setExpanded((prev) => new Set([...prev, notificationType]));
    const el = sectionRefs.current.get(notificationType);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    }
  }

  async function markGroupRead(notificationType: string) {
    await invoke("notifications:mark-group-read", { notificationType });
    void load();
  }

  async function markSourceRead(sg: NotificationSourceGroup) {
    const ids = sg.notifications.filter((n) => n.status === "new").map((n) => n.id);
    if (!ids.length) return;
    await invoke("notifications:mark-batch-read", { ids });
    void load();
  }

  async function checkNow() {
    setChecking(true);
    try {
      await invoke("notifications:check-now");
    } finally {
      setChecking(false);
    }
  }

  async function markAllRead() {
    await invoke("notifications:mark-all-read");
    void load();
  }

  async function openNotification(id: string, sourceUrl: string | null) {
    await invoke("notifications:mark-read", { id });
    if (sourceUrl) window.open(sourceUrl);
    void load();
  }

  function openReminderDialog(notification: NotificationRecord) {
    setReminderForNotification(notification);
    setReminderDialogOpen(true);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center justify-between px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
        <h1 className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
          Notifications
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void checkNow()}
            disabled={checking}
            className="flex items-center gap-1.5 text-xs font-label text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] disabled:opacity-50 transition-colors"
            title="Check for new notifications now"
          >
            <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking..." : "Check now"}
          </button>
          <button
            onClick={() => void markAllRead()}
            disabled={totalUnreadCount === 0}
            className="text-xs font-label text-[var(--primary)] disabled:text-[var(--on-surface-variant)]/50"
          >
            Mark all read
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-56 shrink-0 bg-[var(--surface-container-low)] border-r border-[var(--outline-variant)]/20 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-2 text-xs text-[var(--on-surface-variant)]">Loading...</p>
          ) : groups.length === 0 ? (
            <p className="px-4 py-2 text-xs text-[var(--on-surface-variant)]">No notifications.</p>
          ) : (
            groups.map((group) => {
              const isActive = groupParam === group.notificationType;
              return (
                <button
                  key={group.notificationType}
                  onClick={() => scrollToGroup(group.notificationType)}
                  className={clsx(
                    "flex items-center justify-between gap-2 mx-2 px-3 py-2.5 rounded-md transition-colors text-left",
                    isActive
                      ? "bg-[var(--surface-container-highest)] text-[var(--primary)]"
                      : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)]",
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold font-label truncate">{group.label}</div>
                    <div
                      className={clsx(
                        "text-[10px] font-label truncate capitalize mt-0.5",
                        isActive ? "text-[var(--primary)]/70" : "text-[var(--on-surface-variant)]/60",
                      )}
                    >
                      {group.integration}
                    </div>
                  </div>
                  {group.unreadCount > 0 && (
                    <span className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-[var(--error)] text-white text-[9px] font-bold leading-4 text-center">
                      {group.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </nav>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto bg-[var(--surface)]">
          {loading ? (
            <p className="px-6 py-4 text-xs text-[var(--on-surface-variant)]">Loading...</p>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--on-surface-variant)]">
              <Bell size={32} className="opacity-30" />
              <p className="text-sm">No notifications yet.</p>
            </div>
          ) : (
            <div className="p-6 space-y-4">
            {groups.map((group) => {
              const isExpanded = expanded.has(group.notificationType);
              return (
                <div
                  key={group.notificationType}
                  ref={(el) => {
                    if (el) sectionRefs.current.set(group.notificationType, el);
                    else sectionRefs.current.delete(group.notificationType);
                  }}
                  className="rounded-md border border-[var(--outline-variant)]/20"
                >
                  {/* Group header */}
                  <div className={clsx("flex items-center gap-3 px-4 py-3 bg-[var(--surface-container)] rounded-t-md", !isExpanded && "rounded-b-md")}>
                    <button
                      className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                      onClick={() => toggleExpand(group.notificationType)}
                    >
                      <span className="text-[var(--on-surface-variant)] shrink-0">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <span className="text-sm font-semibold text-[var(--on-surface)] truncate">{group.label}</span>
                      <span
                        className={clsx(
                          "text-[10px] font-label capitalize px-1.5 py-0.5 rounded shrink-0",
                          integrationBadgeClass(group.integration),
                        )}
                      >
                        {group.integration}
                      </span>
                      <span className="text-xs font-label text-[var(--on-surface-variant)] shrink-0">
                        {group.count} total
                      </span>
                      {group.unreadCount > 0 && (
                        <span className="shrink-0 min-w-4 h-4 px-1.5 rounded-full bg-[var(--error)] text-white text-[9px] font-bold leading-4 text-center">
                          {group.unreadCount} new
                        </span>
                      )}
                    </button>
                    {group.unreadCount > 0 && (
                      <button
                        onClick={() => void markGroupRead(group.notificationType)}
                        className="text-[10px] font-label text-[var(--primary)] hover:underline shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>

                  {/* Source-item sub-groups */}
                  {isExpanded && (
                    <div className="divide-y divide-[var(--outline-variant)]/10 rounded-b-md overflow-hidden">
                      {group.sourceGroups.map((sg) => {
                        const srcExpanded = isSourceExpanded(group.notificationType, sg.sourceItemKey);
                        const multiRow = sg.count > 1;
                        return (
                          <div key={sg.sourceItemKey}>
                            {/* Source item header */}
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)]/60 hover:bg-[var(--surface-container-low)] transition-colors">
                              {multiRow ? (
                                <button
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                  onClick={() => toggleExpandSource(group.notificationType, sg.sourceItemKey)}
                                >
                                  <span className="text-[var(--on-surface-variant)] shrink-0">
                                    {srcExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  </span>
                                  <p className="text-xs font-semibold text-[var(--on-surface)] truncate">{sg.sourceLabel}</p>
                                  <span className="text-[10px] font-label text-[var(--on-surface-variant)]/60 shrink-0">
                                    {sg.count} update{sg.count !== 1 ? "s" : ""}
                                  </span>
                                  {sg.unreadCount > 0 && (
                                    <span className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-[var(--error)] text-white text-[9px] font-bold leading-4 text-center">
                                      {sg.unreadCount}
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="shrink-0 w-1.5 h-1.5 rounded-full block" style={{ backgroundColor: sg.unreadCount > 0 ? "var(--primary)" : "transparent", border: sg.unreadCount === 0 ? "1px solid var(--outline-variant)" : "none" }} />
                                  <p className="text-xs font-semibold text-[var(--on-surface)] truncate">{sg.sourceLabel}</p>
                                </div>
                              )}
                              <div className="flex items-center gap-2 shrink-0">
                                {sg.sourceUrl && (
                                  <button
                                    onClick={() => window.open(sg.sourceUrl!)}
                                    className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
                                    title="Open source"
                                  >
                                    <ExternalLink size={11} />
                                  </button>
                                )}
                                {sg.unreadCount > 0 && (
                                  <button
                                    onClick={() => void markSourceRead(sg)}
                                    className="text-[10px] font-label text-[var(--primary)] hover:underline"
                                  >
                                    Mark read
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Individual notification rows: always shown for single-item groups, toggled for multi */}
                            {(!multiRow || srcExpanded) && (
                              <div className="divide-y divide-[var(--outline-variant)]/10">
                                {sg.notifications.map((n) => {
                                  const subtext = getNotificationSubtext(n);
                                  return (
                                    <div
                                      key={n.id}
                                      className="w-full text-left px-6 py-2.5 hover:bg-[var(--surface-container-low)] transition-colors flex items-start gap-3 group"
                                    >
                                      <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full block" style={{ backgroundColor: n.status === "new" ? "var(--primary)" : "transparent", border: n.status !== "new" ? "1px solid var(--outline-variant)" : "none" }} />
                                      <button
                                        onClick={() => void openNotification(n.id, n.sourceUrl)}
                                        className="flex-1 min-w-0 text-left"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs text-[var(--on-surface)] truncate">{n.title}</p>
                                          {n.sourceUrl && (
                                            <ExternalLink size={10} className="text-[var(--on-surface-variant)] shrink-0" />
                                          )}
                                        </div>
                                        {subtext && (
                                          <p className="text-[10px] text-[var(--on-surface-variant)] truncate mt-0.5">{subtext}</p>
                                        )}
                                        <p className="text-[10px] font-label text-[var(--on-surface-variant)]/60 mt-1">
                                          {formatWhen(n.createdAt)}
                                        </p>
                                      </button>
                                      <button
                                        onClick={() => openReminderDialog(n)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 hover:bg-[var(--surface-container)] rounded"
                                        title="Set reminder"
                                      >
                                        <AlarmClock size={12} className="text-[var(--on-surface-variant)]" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>
      </div>

      {reminderDialogOpen && reminderForNotification && (
        <ReminderDialog
          notificationId={reminderForNotification.id}
          initialTitle={reminderForNotification.title}
          initialSourceUrl={reminderForNotification.sourceUrl || undefined}
          onClose={() => {
            setReminderDialogOpen(false);
            setReminderForNotification(null);
          }}
          onSave={() => {
            setReminderDialogOpen(false);
            setReminderForNotification(null);
          }}
        />
      )}
    </div>
  );
}
