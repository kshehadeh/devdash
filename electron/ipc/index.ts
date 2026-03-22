import { registerDeveloperHandlers } from "./developers";
import { registerConnectionHandlers } from "./connections";
import { registerSourceHandlers } from "./sources";
import { registerStatsHandlers } from "./stats";
import { registerSyncHandlers } from "./sync";
import { registerDiscoverHandlers } from "./discover";
import { registerReferenceHandlers } from "./reference";
import { registerReviewsHandlers } from "./reviews";
import { registerSettingsIOHandlers } from "./settings-io";
import { registerIntegrationHandlers } from "./integrations";
import { registerCacheAdminHandlers } from "./cache-admin";
import { registerAppConfigHandlers } from "./app-config";
import { registerUpdateHandlers } from "./updates";
import type { BrowserWindow } from "electron";

export function registerAllHandlers(getWindow: () => BrowserWindow | null) {
  registerAppConfigHandlers();
  registerUpdateHandlers();
  registerDeveloperHandlers();
  registerConnectionHandlers();
  registerIntegrationHandlers();
  registerSourceHandlers();
  registerCacheAdminHandlers();
  registerStatsHandlers();
  registerSyncHandlers();
  registerDiscoverHandlers();
  registerReferenceHandlers();
  registerReviewsHandlers();
  registerSettingsIOHandlers(getWindow);
}
