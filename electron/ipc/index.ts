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
import { registerDevToolsHandlers } from "./dev-tools";
import type { BrowserWindow } from "electron";

export function registerAllHandlers(getWindow: () => BrowserWindow | null) {
  registerAppConfigHandlers();
  registerUpdateHandlers();
  registerNotificationHandlers(getWindow);
  registerDeveloperHandlers();
  registerConnectionHandlers();
  registerIntegrationHandlers();
  registerSourceHandlers();
  registerCacheAdminHandlers();
  registerStatsHandlers();
  registerSyncHandlers();
  registerDiscoverHandlers();
  registerReviewsHandlers();
  registerSettingsIOHandlers(getWindow);
  registerDevToolsHandlers(getWindow);
}
