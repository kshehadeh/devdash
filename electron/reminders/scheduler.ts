import type { BrowserWindow } from "electron";
import { Notification } from "electron";
import { getDueReminders, updateReminderStatus, type ReminderRecord, listReminders } from "../db/reminders";
import { upsertNotificationIfNew } from "../db/notifications";
import { emitRemindersChanged } from "./events";
import { emitNotificationsChanged } from "../notifications/events";
import { getConfig } from "../db/config";
import { getMacOSRemindersStatus } from "./macos-integration";
import { getCurrentUserDeveloper } from "../db/developers";

let intervalId: ReturnType<typeof setInterval> | null = null;
let macOSSyncIntervalId: ReturnType<typeof setInterval> | null = null;
let started = false;

const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const MACOS_SYNC_INTERVAL_MS = 10 * 60 * 1000; // Sync with macOS every 10 minutes

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

  for (const reminder of dueReminders) {
    // Update status to triggered
    updateReminderStatus(reminder.id, "triggered");

    // Show desktop notification
    showDesktopNotification(reminder, getWindow);

    // Note: We don't create in macOS here because it was already created
    // when the reminder was first created in DevDash (see reminders:create IPC handler)

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

async function syncFromMacOSReminders(): Promise<void> {
  const syncToMacOS = getConfig("reminders_sync_macos") === "1";
  console.log(`[Sync] Starting macOS sync check. syncToMacOS=${syncToMacOS}, platform=${process.platform}`);
  
  if (!syncToMacOS || process.platform !== "darwin") {
    console.log(`[Sync] Skipping: syncToMacOS=${syncToMacOS}, platform=${process.platform}`);
    return;
  }

  const currentUser = getCurrentUserDeveloper();
  if (!currentUser) {
    console.log("[Sync] No current user, skipping");
    return;
  }

  try {
    // Get all active DevDash reminders that were synced to macOS
    const devDashReminders = listReminders(currentUser.id, { limit: 200 }).filter(
      (r) => r.status !== "dismissed" && r.syncedToMacos
    );
    console.log(`[Sync] Found ${devDashReminders.length} active DevDash reminders synced to macOS`);

    // Get status of all macOS reminders in DevDash list
    const macOSReminders = await getMacOSRemindersStatus();
    console.log(`[Sync] Found ${macOSReminders.length} incomplete macOS reminders`);

    let updatedCount = 0;
    // Find DevDash reminders that were completed in macOS
    // Note: getMacOSRemindersStatus only returns INCOMPLETE reminders
    // So if a DevDash reminder (that was synced to macOS) is NOT in the macOS list, it was completed
    for (const devDashReminder of devDashReminders) {
      const macOSMatch = macOSReminders.find((m) => m.title === devDashReminder.title);
      
      // If the reminder doesn't exist in macOS incomplete list, it was completed or deleted
      if (!macOSMatch) {
        // Mark as dismissed in DevDash
        const updated = updateReminderStatus(devDashReminder.id, "dismissed");
        if (updated) {
          updatedCount++;
          console.log(`[Sync] ✓ Synced completion from macOS (not in incomplete list): ${devDashReminder.title}`);
        }
      }
    }

    console.log(`[Sync] Completed. Updated ${updatedCount} reminders`);
    
    // Emit change event if any updates were made
    if (updatedCount > 0) {
      emitRemindersChanged();
    }
  } catch (err) {
    console.error("[Sync] Failed to sync from macOS Reminders:", err);
  }
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

  // Start macOS sync polling (every 10 minutes)
  setTimeout(() => {
    console.log("[Sync] Running first scheduled macOS sync (after 30s)");
    void syncFromMacOSReminders();
  }, 30000); // First sync after 30 seconds

  macOSSyncIntervalId = setInterval(() => {
    console.log("[Sync] Running periodic macOS sync (every 10 min)");
    void syncFromMacOSReminders();
  }, MACOS_SYNC_INTERVAL_MS);
}

export function stopReminderScheduler(): void {
  if (intervalId) clearInterval(intervalId);
  if (macOSSyncIntervalId) clearInterval(macOSSyncIntervalId);
  intervalId = null;
  macOSSyncIntervalId = null;
  started = false;
}

export async function manualSyncFromMacOS(): Promise<void> {
  console.log("[Sync] Manual sync triggered by user");
  await syncFromMacOSReminders();
}
