import { ipcMain } from "electron";
import { getIntegrationSettings, setIntegrationProvider } from "../db/integration-settings";
import type { IntegrationCategory } from "../integrations/types";

const CATEGORIES = new Set<IntegrationCategory>(["code", "work", "docs"]);

export function registerIntegrationHandlers() {
  ipcMain.handle("integrations:get", () => getIntegrationSettings());

  ipcMain.handle("integrations:set-provider", (_e, data: { category: string; providerId: string }) => {
    if (!data.category || !CATEGORIES.has(data.category as IntegrationCategory)) {
      throw new Error("Invalid integration category");
    }
    if (!data.providerId?.trim()) throw new Error("providerId required");
    return setIntegrationProvider(data.category as IntegrationCategory, data.providerId.trim());
  });
}
