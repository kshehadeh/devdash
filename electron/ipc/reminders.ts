import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  createReminder,
  getReminderById,
  getTriggeredReminderCount,
  listReminders,
  updateReminder,
  updateReminderStatus,
  markReminderSyncedToMacOS,
  deleteReminder,
  type CreateReminderInput,
  type ListRemindersOptions,
  type ReminderStatus,
  type UpdateReminderInput,
} from "../db/reminders";
import { getCurrentUserDeveloper } from "../db/developers";
import { emitRemindersChanged, onRemindersChanged } from "../reminders/events";
import { getConfig, setConfig } from "../db/config";
import { isMacOSRemindersAvailable, completeMacOSReminder, createMacOSReminder, deleteMacOSReminder } from "../reminders/macos-integration";
import { manualSyncFromMacOS } from "../reminders/scheduler";

function currentUserId(): string | null {
  return getCurrentUserDeveloper()?.id ?? null;
}

export function registerReminderHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle("reminders:create", async (_e, data: CreateReminderInput) => {
    if (!data?.title || !data?.remindAt) throw new Error("Invalid reminder input");
    const devId = currentUserId();
    if (!devId) throw new Error("No current user");

    const reminder = createReminder({
      ...data,
      developerId: devId,
    });
    emitRemindersChanged();
    
    // Immediately sync to macOS Reminders if enabled
    const syncToMacOS = getConfig("reminders_sync_macos") === "1";
    if (syncToMacOS && process.platform === "darwin") {
      try {
        await createMacOSReminder(reminder);
        markReminderSyncedToMacOS(reminder.id, true);
      } catch (err) {
        console.error("Failed to sync new reminder to macOS:", err);
        // Don't fail the create operation if macOS sync fails
      }
    }
    
    return { reminder };
  });

  ipcMain.handle("reminders:list", (_e, data?: ListRemindersOptions) => {
    const devId = currentUserId();
    if (!devId) return { reminders: [] };

    const reminders = listReminders(devId, data);
    return { reminders };
  });

  ipcMain.handle("reminders:get", (_e, data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid reminder id");
    return getReminderById(data.id);
  });

  ipcMain.handle("reminders:update", (_e, data: { id: string; updates: UpdateReminderInput }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid reminder id");
    if (!data.updates) throw new Error("No updates provided");

    const success = updateReminder(data.id, data.updates);
    if (success) emitRemindersChanged();
    return { success };
  });

  ipcMain.handle("reminders:dismiss", async (_e, data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid reminder id");

    // Get the reminder before dismissing to sync with macOS
    const reminder = getReminderById(data.id);
    const success = updateReminderStatus(data.id, "dismissed");
    
    if (success) {
      emitRemindersChanged();
      
      // If macOS sync is enabled and reminder exists, mark it as completed in macOS Reminders
      const syncToMacOS = getConfig("reminders_sync_macos") === "1";
      if (syncToMacOS && reminder && process.platform === "darwin") {
        try {
          await completeMacOSReminder(reminder.title);
        } catch (err) {
          console.error("Failed to complete macOS reminder:", err);
          // Don't fail the dismiss operation if macOS sync fails
        }
      }
    }
    
    return { success };
  });

  ipcMain.handle("reminders:snooze", (_e, data: { id: string; snoozedUntil: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid reminder id");
    if (!data?.snoozedUntil || typeof data.snoozedUntil !== "string") {
      throw new Error("Invalid snoozedUntil value");
    }

    const success = updateReminderStatus(data.id, "snoozed", data.snoozedUntil);
    if (success) emitRemindersChanged();
    return { success };
  });

  ipcMain.handle("reminders:delete", async (_e, data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid reminder id");

    // Get the reminder before deleting to sync with macOS
    const reminder = getReminderById(data.id);
    const success = deleteReminder(data.id);
    
    if (success) {
      emitRemindersChanged();
      
      // If macOS sync is enabled and reminder exists, delete it from macOS Reminders
      const syncToMacOS = getConfig("reminders_sync_macos") === "1";
      if (syncToMacOS && reminder && process.platform === "darwin") {
        try {
          await deleteMacOSReminder(reminder.title);
        } catch (err) {
          console.error("Failed to delete macOS reminder:", err);
          // Don't fail the delete operation if macOS sync fails
        }
      }
    }
    
    return { success };
  });

  ipcMain.handle("reminders:triggered-count", () => {
    const devId = currentUserId();
    if (!devId) return { count: 0 };
    const count = getTriggeredReminderCount(devId);
    return { count };
  });

  ipcMain.handle("reminders:config:get", async () => {
    const syncToMacOS = getConfig("reminders_sync_macos") === "1";
    const macOSAvailable = await isMacOSRemindersAvailable();
    return { syncToMacOS, macOSAvailable };
  });

  ipcMain.handle("reminders:config:set", (_e, data: { syncToMacOS: boolean }) => {
    if (typeof data?.syncToMacOS !== "boolean") throw new Error("Invalid syncToMacOS value");
    setConfig("reminders_sync_macos", data.syncToMacOS ? "1" : "0");
    return { success: true };
  });

  ipcMain.handle("reminders:sync-now", async () => {
    await manualSyncFromMacOS();
    return { success: true };
  });

  const pushChanged = onRemindersChanged(() => {
    const win = getWindow();
    win?.webContents.send("reminders:changed");
  });

  ipcMain.on("reminders:unsubscribe-events", () => {
    pushChanged();
  });
}
