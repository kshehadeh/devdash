import { registerDeveloperHandlers } from "./developers";
import { registerConnectionHandlers } from "./connections";
import { registerSourceHandlers } from "./sources";
import { registerStatsHandlers } from "./stats";
import { registerSyncHandlers } from "./sync";
import { registerDiscoverHandlers } from "./discover";
import { registerReferenceHandlers } from "./reference";

export function registerAllHandlers() {
  registerDeveloperHandlers();
  registerConnectionHandlers();
  registerSourceHandlers();
  registerStatsHandlers();
  registerSyncHandlers();
  registerDiscoverHandlers();
  registerReferenceHandlers();
}
