import { Notification, BrowserWindow } from "electron";
import type { NotificationRecord } from "../db/notifications";
import { emitNotificationOpen } from "./events";

export function showDesktopNotification(record: NotificationRecord, getWindow: () => BrowserWindow | null): void {
  if (!Notification.isSupported()) return;
  const toast = new Notification({
    title: record.title,
    body: record.body,
    silent: false,
  });
  toast.on("click", () => {
    const win = getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    emitNotificationOpen(record.id);
  });
  toast.show();
}
