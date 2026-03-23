import type { BrowserWindow } from "electron";
import { getNotificationPollIntervalMs, pollNotifications } from "./service";

let intervalId: ReturnType<typeof setInterval> | null = null;
let started = false;
let activeIntervalMs = 0;

export function startNotificationScheduler(getWindow: () => BrowserWindow | null): void {
  if (started) return;
  started = true;

  const start = () => {
    activeIntervalMs = getNotificationPollIntervalMs();
    intervalId = setInterval(() => {
      void pollNotifications(getWindow);
    }, activeIntervalMs);
  };

  setTimeout(() => {
    void pollNotifications(getWindow);
    start();
  }, 8000);
}

export function refreshNotificationScheduler(getWindow: () => BrowserWindow | null): void {
  const next = getNotificationPollIntervalMs();
  if (!started || next === activeIntervalMs) return;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  started = false;
  startNotificationScheduler(getWindow);
}

export function stopNotificationScheduler(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  started = false;
  activeIntervalMs = 0;
}
