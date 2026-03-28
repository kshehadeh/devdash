import { BrowserWindow, net } from "electron";

const POLL_MS = 4000;

let lastOnline: boolean | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let started = false;

function readOnline(): boolean {
  return net.isOnline();
}

function broadcast(online: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("network:status", { online });
    }
  }
}

/** Synchronous read for IPC; matches last poll result once the monitor has run. */
export function isNetworkOnline(): boolean {
  if (lastOnline === null) return readOnline();
  return lastOnline;
}

export function startNetworkMonitor(): void {
  if (started) return;
  started = true;

  const tick = () => {
    const now = readOnline();
    if (lastOnline === null) {
      lastOnline = now;
      broadcast(now);
      return;
    }
    if (now === lastOnline) return;
    const wasOffline = !lastOnline;
    lastOnline = now;
    broadcast(now);
    if (wasOffline && now) {
      import("./sync/engine")
        .then(({ syncAll }) => syncAll().catch((err) => console.error("[Network] Reconnect sync error:", err)))
        .catch((err) => console.error("[Network] Failed to load sync engine:", err));
    }
  };

  tick();
  intervalId = setInterval(tick, POLL_MS);
}

export function stopNetworkMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  started = false;
  lastOnline = null;
}
