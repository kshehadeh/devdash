import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { ReminderRecord } from "../db/reminders";

const execAsync = promisify(exec);

async function execAppleScript(script: string, timeoutMs = 10000): Promise<string> {
  const tmpFile = join(tmpdir(), `devdash-${Date.now()}.scpt`);
  try {
    await writeFile(tmpFile, script, "utf8");
    const { stdout } = await execAsync(`osascript "${tmpFile}"`, { timeout: timeoutMs });
    return stdout;
  } finally {
    await unlink(tmpFile).catch(() => {/* ignore cleanup errors */});
  }
}

function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export async function isMacOSRemindersAvailable(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  
  try {
    await execAppleScript('tell application "Reminders" to get name of lists');
    return true;
  } catch {
    return false;
  }
}

export async function getMacOSReminderLists(): Promise<string[]> {
  if (process.platform !== "darwin") return [];
  
  try {
    const stdout = await execAppleScript('tell application "Reminders" to get name of lists');
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
  await execAppleScript(script);
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
    await execAppleScript(script, 10000);
  } catch (err) {
    console.error("Failed to create macOS reminder:", err);
    throw new Error("Failed to sync to macOS Reminders");
  }
}

export interface MacOSReminderStatus {
  title: string;
  dueDate: string | null;
  completed: boolean;
  completionDate: string | null;
}

export async function getMacOSRemindersStatus(listName = "DevDash"): Promise<MacOSReminderStatus[]> {
  if (process.platform !== "darwin") return [];

  const escapedList = escapeAppleScript(listName);
  
  // Simplified script that only gets incomplete reminders (to avoid processing old completed ones)
  const script = `
    set output to ""
    tell application "Reminders"
      if not (exists list "${escapedList}") then
        return output
      end if
      
      tell list "${escapedList}"
        -- Only get incomplete reminders to avoid processing large lists
        set theReminders to (every reminder whose completed is false)
        set reminderCount to count of theReminders
        
        -- Safety limit: only process first 100 reminders
        if reminderCount > 100 then
          set reminderCount to 100
        end if
        
        repeat with i from 1 to reminderCount
          try
            set aReminder to item i of theReminders
            set reminderName to name of aReminder
            set dueDate to ""
            
            try
              if due date of aReminder is not missing value then
                set dueDate to due date of aReminder as string
              end if
            end try
            
            -- Only include incomplete reminders, so completed is always false
            set output to output & reminderName & "|||" & dueDate & "|||false|||:::"
          on error errMsg
            -- Skip this reminder if there's an error
            log "Error processing reminder: " & errMsg
          end try
        end repeat
      end tell
    end tell
    return output
  `;

  try {
    const stdout = await execAppleScript(script, 30000);
    if (!stdout.trim()) return [];

    const reminders: MacOSReminderStatus[] = [];
    const entries = stdout.trim().split(":::");
    
    for (const entry of entries) {
      if (!entry.trim()) continue;
      const [title, dueDate, completed] = entry.split("|||");
      if (!title) continue;
      
      reminders.push({
        title: title.trim(),
        dueDate: dueDate.trim() || null,
        completed: completed.trim() === "true",
        completionDate: null, // We're only querying incomplete ones
      });
    }
    
    return reminders;
  } catch (err) {
    console.error("Failed to get macOS reminders status:", err);
    return [];
  }
}

export async function completeMacOSReminder(title: string, listName = "DevDash"): Promise<void> {
  if (process.platform !== "darwin") return;

  const escapedTitle = escapeAppleScript(title);
  const escapedList = escapeAppleScript(listName);
  
  const script = `
    tell application "Reminders"
      if not (exists list "${escapedList}") then
        return
      end if
      
      tell list "${escapedList}"
        set theReminders to (every reminder whose name is "${escapedTitle}" and completed is false)
        repeat with aReminder in theReminders
          set completed of aReminder to true
        end repeat
      end tell
    end tell
  `;

  try {
    await execAppleScript(script, 10000);
  } catch (err) {
    console.error("Failed to complete macOS reminder:", err);
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
    await execAppleScript(script);
  } catch (err) {
    console.error("Failed to delete macOS reminder:", err);
  }
}
