"use client";

import { useCallback, useEffect, useState } from "react";
import { AlarmClock, X, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { invoke } from "@/lib/api";
import type { ReminderRecord, RemindersListResponse } from "@/lib/types";

export function TriggeredRemindersBanner() {
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await invoke<RemindersListResponse>("reminders:list", { status: "triggered", limit: 3 });
      setReminders(res.reminders);
    } catch {
      setReminders([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = window.electron.onRemindersChanged(() => {
      void load();
    });
    return unsub;
  }, [load]);

  async function handleDismiss(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDismissed((prev) => new Set([...prev, id]));
    await invoke("reminders:dismiss", { id });
    void load();
  }

  const visibleReminders = reminders.filter((r) => !dismissed.has(r.id));

  if (visibleReminders.length === 0) return null;

  return (
    <div className="bg-[var(--error-container)] border border-[var(--error)]/20 rounded-md p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlarmClock size={18} className="text-[var(--error)] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--on-error-container)] mb-2">
            You have {visibleReminders.length} triggered reminder{visibleReminders.length !== 1 ? "s" : ""}
          </h3>
          <div className="space-y-2">
            {visibleReminders.map((reminder) => (
              <div
                key={reminder.id}
                className="flex items-center justify-between gap-3 bg-[var(--surface-container)]/50 rounded px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  {reminder.sourceUrl ? (
                    <a
                      href={reminder.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[var(--primary)] hover:underline truncate flex items-center gap-1"
                    >
                      {reminder.title}
                      <ExternalLink size={10} />
                    </a>
                  ) : (
                    <p className="text-xs font-semibold text-[var(--on-surface)] truncate">
                      {reminder.title}
                    </p>
                  )}
                  {reminder.comment && (
                    <p className="text-[10px] text-[var(--on-surface-variant)] truncate mt-0.5">
                      {reminder.comment}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => void handleDismiss(reminder.id, e)}
                  className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] shrink-0"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          {reminders.length > 3 && (
            <Link
              to="/reminders?status=triggered"
              className="inline-block mt-2 text-xs font-label text-[var(--primary)] hover:underline"
            >
              View all reminders →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
