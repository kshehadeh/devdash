import type { BrowserWindow } from "electron";
import { Notification } from "electron";
import { getDueReminders, updateReminderStatus, type ReminderRecord } from "../db/reminders";
import { upsertNotificationIfNew } from "../db/notifications";
import { emitRemindersChanged } from "./events";
import { emitNotificationsChanged } from "../notifications/events";
import { getConfig } from "../db/config";
import { createMacOSReminder } from "./macos-integration";

let intervalId: ReturnType<typeof setInterval> | null = null;
let started = false;

const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

function showDesktopNotification(reminder: ReminderRecord, getWindow: () => BrowserWindow | null): void {
  if (!Notification.isSupported()) return;
  const toast = new Notification({
    title: `Reminder: ${reminder.title}`,
    body: reminder.comment || "You set a reminder for this item",
    silent: false,
  });
  toast.on("click", () => {
    const win = getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    // Navigate to reminders page - the frontend will handle this via IPC
    win?.webContents.send("reminders:navigate", { id: reminder.id });
  });
  toast.show();
}

async function checkDueReminders(getWindow: () => BrowserWindow | null): Promise<void> {
  const dueReminders = getDueReminders();
  if (dueReminders.length === 0) return;

  const syncToMacOS = getConfig("reminders_sync_macos") === "1";

  for (const reminder of dueReminders) {
    // Update status to triggered
    updateReminderStatus(reminder.id, "triggered");

    // Show desktop notification
    showDesktopNotification(reminder, getWindow);

    // Optionally sync to macOS Reminders
    if (syncToMacOS && process.platform === "darwin") {
      try {
        await createMacOSReminder(reminder);
      } catch (err) {
        console.error("Failed to sync reminder to macOS:", err);
      }
    }

    // Re-surface in notifications list
    upsertNotificationIfNew({
      developerId: reminder.developerId,
      integration: "reminder",
      notificationType: "reminder_triggered",
      fingerprint: `${reminder.id}:${reminder.remindAt}`,
      title: reminder.title,
      body: reminder.comment || "Reminder",
      payload: { reminderId: reminder.id },
      sourceUrl: reminder.sourceUrl ?? null,
      eventUpdatedAt: new Date().toISOString(),
    });
  }

  // Emit events to refresh UI
  emitRemindersChanged();
  emitNotificationsChanged();
}

export function startReminderScheduler(getWindow: () => BrowserWindow | null): void {
  if (started) return;
  started = true;

  // Check immediately on start (with small delay)
  setTimeout(() => {
    void checkDueReminders(getWindow);
  }, 5000);

  // Then check periodically
  intervalId = setInterval(() => {
    void checkDueReminders(getWindow);
  }, CHECK_INTERVAL_MS);
}

export function stopReminderScheduler(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  started = false;
}
