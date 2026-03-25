"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlarmClock, Plus, ExternalLink, Clock, MessageSquare, Settings2 } from "lucide-react";
import { clsx } from "clsx";
import { invoke } from "@/lib/api";
import type { ReminderRecord, RemindersListResponse, ReminderStatus } from "@/lib/types";
import { ReminderDialog } from "@/components/reminders/ReminderDialog";
import { SnoozePopover } from "@/components/reminders/SnoozePopover";

type FilterStatus = "all" | ReminderStatus;

function formatRemindAt(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (diff < 0) return "Past due";
  if (minutes < 60) return `in ${minutes}m`;
  if (hours < 24) return `in ${hours}h`;
  if (days < 7) return `in ${days}d`;
  return date.toLocaleDateString();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function statusBadgeClass(status: ReminderStatus): string {
  switch (status) {
    case "pending":
      return "bg-blue-400/10 text-blue-400";
    case "triggered":
      return "bg-[var(--error)]/10 text-[var(--error)]";
    case "snoozed":
      return "bg-amber-400/10 text-amber-400";
    case "dismissed":
      return "bg-[var(--on-surface-variant)]/10 text-[var(--on-surface-variant)]";
  }
}

export default function RemindersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderRecord | null>(null);
  const [snoozeReminderId, setSnoozeReminderId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [syncToMacOS, setSyncToMacOS] = useState(false);
  const [macOSAvailable, setMacOSAvailable] = useState(false);

  const statusParam = searchParams.get("status") as ReminderStatus | null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const opts = filter !== "all" ? { status: filter } : undefined;
      const res = await invoke<RemindersListResponse>("reminders:list", opts);
      
      // Sort reminders based on filter
      let sorted = [...res.reminders];
      if (filter === "all") {
        // For "all", sort by: triggered first, then pending/snoozed by remind_at ascending
        sorted.sort((a, b) => {
          if (a.status === "triggered" && b.status !== "triggered") return -1;
          if (a.status !== "triggered" && b.status === "triggered") return 1;
          return new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime();
        });
      }
      
      setReminders(sorted);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadConfig = useCallback(async () => {
    try {
      const res = await invoke<{ syncToMacOS: boolean; macOSAvailable: boolean }>("reminders:config:get");
      setSyncToMacOS(res.syncToMacOS);
      setMacOSAvailable(res.macOSAvailable);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    void load();
    void loadConfig();
  }, [load, loadConfig]);

  useEffect(() => {
    if (statusParam && ["pending", "triggered", "snoozed", "dismissed"].includes(statusParam)) {
      setFilter(statusParam);
    }
  }, [statusParam]);

  useEffect(() => {
    const unsub = window.electron.onRemindersChanged(() => {
      void load();
    });
    return unsub;
  }, [load]);

  useEffect(() => {
    const unsub = window.electron.onReminderNavigate(({ id }) => {
      const reminder = reminders.find((r) => r.id === id);
      if (reminder) {
        setFilter("triggered");
        setSearchParams({ status: "triggered" });
      }
    });
    return unsub;
  }, [reminders, setSearchParams]);

  function openCreateDialog() {
    setEditingReminder(null);
    setDialogOpen(true);
  }

  function openEditDialog(reminder: ReminderRecord) {
    setEditingReminder(reminder);
    setDialogOpen(true);
  }

  async function handleDismiss(id: string) {
    await invoke("reminders:dismiss", { id });
    void load();
  }

  async function handleSnooze(id: string, snoozedUntil: string) {
    await invoke("reminders:snooze", { id, snoozedUntil });
    setSnoozeReminderId(null);
    void load();
  }

  async function handleToggleMacOSSync() {
    const newValue = !syncToMacOS;
    setSyncToMacOS(newValue);
    await invoke("reminders:config:set", { syncToMacOS: newValue });
  }

  const filteredReminders = reminders;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center justify-between px-6 h-14 bg-[var(--surface-container-low)] shrink-0">
        <h1 className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
          Reminders
        </h1>
        <div className="flex items-center gap-3">
          {macOSAvailable && (
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-[var(--surface-container)] text-xs font-label text-[var(--on-surface-variant)] transition-colors"
              >
                <Settings2 size={14} />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--surface-container-highest)] rounded-md shadow-lg border border-[var(--outline-variant)]/30 z-50 p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncToMacOS}
                      onChange={() => void handleToggleMacOSSync()}
                      className="w-4 h-4"
                    />
                    <span className="text-xs text-[var(--on-surface)]">
                      Sync to macOS Reminders
                    </span>
                  </label>
                  <p className="text-[10px] text-[var(--on-surface-variant)] mt-2">
                    When enabled, triggered reminders will also be created in the macOS Reminders app.
                  </p>
                </div>
              )}
            </div>
          )}
          <button
            onClick={openCreateDialog}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90 text-xs font-label transition-colors"
          >
            <Plus size={14} />
            New Reminder
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-56 shrink-0 bg-[var(--surface-container-low)] border-r border-[var(--outline-variant)]/20 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {(["all", "pending", "triggered", "snoozed", "dismissed"] as const).map((status) => {
            const isActive = filter === status;
            const count = status === "all" ? reminders.length : reminders.filter((r) => r.status === status).length;
            return (
              <button
                key={status}
                onClick={() => {
                  setFilter(status);
                  if (status !== "all") {
                    setSearchParams({ status });
                  } else {
                    setSearchParams({});
                  }
                }}
                className={clsx(
                  "flex items-center justify-between gap-2 mx-2 px-3 py-2.5 rounded-md transition-colors text-left",
                  isActive
                    ? "bg-[var(--surface-container-highest)] text-[var(--primary)]"
                    : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)]",
                )}
              >
                <span className="text-xs font-semibold font-label capitalize">{status}</span>
                {count > 0 && (
                  <span className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-[var(--surface-container-highest)] text-[var(--on-surface-variant)] text-[9px] font-bold leading-4 text-center">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-[var(--surface)]">
          {loading ? (
            <p className="px-6 py-4 text-xs text-[var(--on-surface-variant)]">Loading...</p>
          ) : filteredReminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--on-surface-variant)]">
              <AlarmClock size={32} className="opacity-30" />
              <p className="text-sm">
                {filter === "all" ? "No reminders yet." : `No ${filter} reminders.`}
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-3">
              {filteredReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="rounded-md border border-[var(--outline-variant)]/20 bg-[var(--surface-container)] p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {reminder.sourceUrl ? (
                          <a
                            href={reminder.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-[var(--primary)] hover:underline truncate flex items-center gap-1"
                          >
                            {reminder.title}
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <h3 className="text-sm font-semibold text-[var(--on-surface)] truncate">
                            {reminder.title}
                          </h3>
                        )}
                        <span
                          className={clsx(
                            "text-[10px] font-label capitalize px-1.5 py-0.5 rounded shrink-0",
                            statusBadgeClass(reminder.status),
                          )}
                        >
                          {reminder.status}
                        </span>
                      </div>
                      {reminder.comment && (
                        <p className="text-xs text-[var(--on-surface-variant)] mb-2 flex items-start gap-1.5">
                          <MessageSquare size={12} className="mt-0.5 shrink-0" />
                          <span className="line-clamp-2">{reminder.comment}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] font-label text-[var(--on-surface-variant)]/60">
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {formatRemindAt(reminder.remindAt)} · {formatDateTime(reminder.remindAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-start mt-1">
                      {reminder.status !== "dismissed" && (
                        <>
                          {reminder.status === "pending" && (
                            <button
                              onClick={() => openEditDialog(reminder)}
                              className="text-[10px] font-label text-[var(--primary)] hover:underline whitespace-nowrap"
                            >
                              Edit
                            </button>
                          )}
                          <div className="relative">
                            <button
                              onClick={() => setSnoozeReminderId(reminder.id)}
                              className="text-[10px] font-label text-[var(--primary)] hover:underline whitespace-nowrap"
                            >
                              Snooze
                            </button>
                            {snoozeReminderId === reminder.id && (
                              <SnoozePopover
                                onSnooze={(until) => void handleSnooze(reminder.id, until)}
                                onClose={() => setSnoozeReminderId(null)}
                              />
                            )}
                          </div>
                          <button
                            onClick={() => void handleDismiss(reminder.id)}
                            className="text-[10px] font-label text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] whitespace-nowrap"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {dialogOpen && (
        <ReminderDialog
          reminder={editingReminder}
          onClose={() => {
            setDialogOpen(false);
            setEditingReminder(null);
          }}
          onSave={() => {
            setDialogOpen(false);
            setEditingReminder(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
