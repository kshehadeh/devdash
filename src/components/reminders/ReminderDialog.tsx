"use client";

import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { invoke } from "@/lib/api";
import type { ReminderRecord } from "@/lib/types";

interface ReminderDialogProps {
  reminder?: ReminderRecord | null;
  notificationId?: string;
  initialTitle?: string;
  initialSourceUrl?: string;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export function ReminderDialog({
  reminder,
  notificationId,
  initialTitle,
  initialSourceUrl,
  onClose,
  onSave,
  onDelete,
}: ReminderDialogProps) {
  const isEdit = !!reminder;
  const [title, setTitle] = useState(reminder?.title || initialTitle || "");
  const [comment, setComment] = useState(reminder?.comment || "");
  const [sourceUrl, setSourceUrl] = useState(reminder?.sourceUrl || initialSourceUrl || "");
  const [remindAt, setRemindAt] = useState(() => {
    if (reminder?.remindAt) {
      return new Date(reminder.remindAt).toISOString().slice(0, 16);
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!title.trim() || !remindAt) return;

    setSaving(true);
    try {
      if (isEdit) {
        await invoke("reminders:update", {
          id: reminder.id,
          updates: {
            title: title.trim(),
            comment: comment.trim(),
            remindAt: new Date(remindAt).toISOString(),
          },
        });
      } else {
        await invoke("reminders:create", {
          notificationId: notificationId || null,
          title: title.trim(),
          comment: comment.trim(),
          sourceUrl: sourceUrl.trim() || null,
          remindAt: new Date(remindAt).toISOString(),
        });
      }
      onSave();
    } catch (err) {
      console.error("Failed to save reminder:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || !reminder) return;
    if (!confirm("Are you sure you want to delete this reminder?")) return;

    setDeleting(true);
    try {
      await invoke("reminders:delete", { id: reminder.id });
      onDelete?.();
    } catch (err) {
      console.error("Failed to delete reminder:", err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--surface-container-highest)] rounded-lg shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--outline-variant)]/20">
          <h2 className="text-lg font-semibold text-[var(--on-surface)]">
            {isEdit ? "Edit Reminder" : "New Reminder"}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-label text-[var(--on-surface-variant)] mb-1.5">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[var(--surface-container)] text-[var(--on-surface)] text-sm border border-[var(--outline-variant)]/30 focus:outline-none focus:border-[var(--primary)]"
              placeholder="What do you want to be reminded about?"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-label text-[var(--on-surface-variant)] mb-1.5">
              Comment
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-[var(--surface-container)] text-[var(--on-surface)] text-sm border border-[var(--outline-variant)]/30 focus:outline-none focus:border-[var(--primary)] resize-none"
              placeholder="Add any notes or context..."
            />
          </div>

          {!isEdit && !notificationId && (
            <div>
              <label className="block text-xs font-label text-[var(--on-surface-variant)] mb-1.5">
                Source URL (optional)
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-[var(--surface-container)] text-[var(--on-surface)] text-sm border border-[var(--outline-variant)]/30 focus:outline-none focus:border-[var(--primary)]"
                placeholder="https://..."
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-label text-[var(--on-surface-variant)] mb-1.5">
              Remind me at *
            </label>
            <input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[var(--surface-container)] text-[var(--on-surface)] text-sm border border-[var(--outline-variant)]/30 focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--outline-variant)]/20">
          <div>
            {isEdit && (
              <button
                onClick={() => void handleDelete()}
                disabled={deleting || saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-label text-[var(--error)] hover:bg-[var(--error)]/10 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-label text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!title.trim() || !remindAt || saving || deleting}
              className="px-4 py-2 rounded-md bg-[var(--primary)] text-[var(--on-primary)] text-sm font-label hover:bg-[var(--primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
