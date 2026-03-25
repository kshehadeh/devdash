import { exec } from "child_process";
import { promisify } from "util";
import type { ReminderRecord } from "../db/reminders";

const execAsync = promisify(exec);

function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export async function isMacOSRemindersAvailable(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  
  try {
    await execAsync('osascript -e "tell application \\"Reminders\\" to get name of lists"');
    return true;
  } catch {
    return false;
  }
}

export async function getMacOSReminderLists(): Promise<string[]> {
  if (process.platform !== "darwin") return [];
  
  try {
    const { stdout } = await execAsync('osascript -e "tell application \\"Reminders\\" to get name of lists"');
    return stdout
      .trim()
      .split(", ")
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function ensureMacOSReminderList(listName: string): Promise<void> {
  if (process.platform !== "darwin") return;
  
  const lists = await getMacOSReminderLists();
  if (lists.includes(listName)) return;

  const script = `tell application "Reminders" to make new list with properties {name:"${escapeAppleScript(listName)}"}`;
  await execAsync(`osascript -e '${script}'`);
}

export async function createMacOSReminder(
  reminder: ReminderRecord,
  listName = "DevDash"
): Promise<void> {
  if (process.platform !== "darwin") return;

  await ensureMacOSReminderList(listName);

  const dueDate = new Date(reminder.remindAt);
  
  // Format: "date \"Tuesday, January 1, 2024 at 9:00:00 AM\""
  const dateStr = dueDate.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const title = escapeAppleScript(reminder.title);
  const notes = escapeAppleScript(reminder.comment || "Created by DevDash");
  
  const script = `
    tell application "Reminders"
      tell list "${escapeAppleScript(listName)}"
        make new reminder with properties {name:"${title}", body:"${notes}", due date:date "${dateStr}"}
      end tell
    end tell
  `;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (err) {
    console.error("Failed to create macOS reminder:", err);
    throw new Error("Failed to sync to macOS Reminders");
  }
}

export async function deleteMacOSReminder(title: string, listName = "DevDash"): Promise<void> {
  if (process.platform !== "darwin") return;

  const escapedTitle = escapeAppleScript(title);
  const escapedList = escapeAppleScript(listName);
  
  const script = `
    tell application "Reminders"
      tell list "${escapedList}"
        set theReminders to (every reminder whose name is "${escapedTitle}")
        repeat with aReminder in theReminders
          delete aReminder
        end repeat
      end tell
    end tell
  `;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (err) {
    console.error("Failed to delete macOS reminder:", err);
  }
}
