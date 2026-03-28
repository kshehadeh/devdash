import { isNetworkOnline } from "../network-monitor";
import { syncAll } from "./engine";

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;
let started = false;

export function startSyncScheduler(): void {
  if (started) return;
  started = true;

  console.log("[SyncScheduler] Starting — initial sync in 5s, then every 15 minutes");

  // Delay initial sync by 5 seconds to let the server finish starting
  setTimeout(() => {
    if (!isNetworkOnline()) return;
    syncAll().catch((err) => console.error("[SyncScheduler] Initial sync error:", err));
  }, 5000);

  intervalId = setInterval(() => {
    if (!isNetworkOnline()) return;
    syncAll().catch((err) => console.error("[SyncScheduler] Scheduled sync error:", err));
  }, SYNC_INTERVAL_MS);
}

export function stopSyncScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  started = false;
}
