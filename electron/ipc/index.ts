import { registerDeveloperHandlers } from "./developers";
import { registerConnectionHandlers } from "./connections";
import { registerSourceHandlers } from "./sources";
import { registerStatsHandlers } from "./stats";
import { registerSyncHandlers } from "./sync";
import { registerDiscoverHandlers } from "./discover";
import { registerReferenceHandlers } from "./reference";
import { registerReviewsHandlers } from "./reviews";
import { registerSettingsIOHandlers } from "./settings-io";
import type { BrowserWindow } from "electron";

export function registerAllHandlers(getWindow: () => BrowserWindow | null) {
  registerDeveloperHandlers();
  registerConnectionHandlers();
  registerSourceHandlers();
  registerStatsHandlers();
  registerSyncHandlers();
  registerDiscoverHandlers();
  registerReferenceHandlers();
  registerReviewsHandlers();
  registerSettingsIOHandlers(getWindow);
}
