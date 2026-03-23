import type { BrowserWindow } from "electron";
import { getCurrentUserDeveloper } from "../db/developers";
import { getConfig } from "../db/config";
import {
  ensureNotificationPreference,
  getNotificationPreference,
  type NotificationRecord,
  upsertNotificationIfNew,
} from "../db/notifications";
import { showDesktopNotification } from "./desktop";
import { emitNotificationsChanged } from "./events";
import { getRegisteredNotificationDefinitions } from "./registry";

const DEFAULT_POLL_INTERVAL_MS = 10 * 60 * 1000;
const MIN_POLL_INTERVAL_MS = 60 * 1000;
const MAX_POLL_INTERVAL_MS = 60 * 60 * 1000;

function parsePollIntervalMs(value: string | null): number {
  if (!value) return DEFAULT_POLL_INTERVAL_MS;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, n));
}

export function getNotificationPollIntervalMs(): number {
  return parsePollIntervalMs(getConfig("notifications_poll_interval_ms"));
}

export function areNotificationsEnabled(): boolean {
  return getConfig("notifications_enabled") !== "0";
}

function isDefinitionEnabled(integration: string, notificationType: string, defaultEnabled: boolean): boolean {
  const existing = getNotificationPreference(integration, notificationType);
  if (existing) return existing.enabled;
  const created = ensureNotificationPreference({
    integration,
    notificationType,
    defaultEnabled,
  });
  return created.enabled;
}

export async function pollNotifications(getWindow: () => BrowserWindow | null): Promise<number> {
  if (!areNotificationsEnabled()) return 0;
  const currentUser = getCurrentUserDeveloper();
  if (!currentUser) return 0;

  const defs = getRegisteredNotificationDefinitions();
  const inserted: NotificationRecord[] = [];

  await Promise.all(defs.map(async (def) => {
    const enabled = isDefinitionEnabled(def.integration, def.notificationType, def.defaultEnabled);
    if (!enabled) return;
    try {
      const events = await def.poll(currentUser.id);
      for (const event of events) {
        const insertedRecord = upsertNotificationIfNew({
          developerId: currentUser.id,
          integration: def.integration,
          notificationType: def.notificationType,
          fingerprint: def.fingerprint(event),
          title: event.title,
          body: event.body,
          payload: {
            ...(event.payload ?? {}),
            strategyId: def.strategy.id,
            strategyVersion: def.strategy.version,
          },
          sourceUrl: event.sourceUrl ?? null,
          eventUpdatedAt: event.eventUpdatedAt,
        });
        if (insertedRecord) inserted.push(insertedRecord);
      }
    } catch (err) {
      console.error(`[Notifications] Poll error for ${def.integration}/${def.notificationType}:`, err);
    }
  }));

  if (inserted.length > 0) {
    for (const notification of inserted) {
      showDesktopNotification(notification, getWindow);
    }
    emitNotificationsChanged();
  }
  return inserted.length;
}
