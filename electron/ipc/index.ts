import { registerDeveloperHandlers } from "./developers";
import { registerConnectionHandlers } from "./connections";
import { registerSourceHandlers } from "./sources";
import { registerStatsHandlers } from "./stats";
import { registerSyncHandlers } from "./sync";
import { registerDiscoverHandlers } from "./discover";
import { registerReviewsHandlers } from "./reviews";
import { registerSettingsIOHandlers } from "./settings-io";
import { registerIntegrationHandlers } from "./integrations";
import { registerCacheAdminHandlers } from "./cache-admin";
import { registerAppConfigHandlers } from "./app-config";
import { registerUpdateHandlers } from "./updates";
import { registerNotificationHandlers } from "./notifications";
import { registerReminderHandlers } from "./reminders";
import { registerDevToolsHandlers } from "./dev-tools";
import { registerContextMenuHandlers } from "./context-menu";
import { registerSearchHandlers } from "./search";
import type { BrowserWindow } from "electron";

export function registerAllHandlers(getWindow: () => BrowserWindow | null) {
  registerAppConfigHandlers();
  registerUpdateHandlers();
  registerNotificationHandlers(getWindow);
  registerReminderHandlers(getWindow);
  registerContextMenuHandlers(getWindow);
  registerDeveloperHandlers();
  registerConnectionHandlers();
  registerIntegrationHandlers();
  registerSourceHandlers();
  registerCacheAdminHandlers();
  registerStatsHandlers();
  registerSearchHandlers();
  registerSyncHandlers();
  registerDiscoverHandlers();
  registerReviewsHandlers();
  registerSettingsIOHandlers(getWindow);
  registerDevToolsHandlers(getWindow);
}
