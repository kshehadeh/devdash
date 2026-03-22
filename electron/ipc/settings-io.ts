import { ipcMain, dialog, BrowserWindow, app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { listDevelopers, createDeveloper, updateDeveloper } from "../db/developers";
import { listSources, createSource, getSourcesForDeveloper, setSourcesForDeveloper } from "../db/sources";
import { listConnections, saveConnection } from "../db/connections";
import type { ConnectionId } from "../db/connections";
import type { DataSource } from "../types";
import { getIntegrationSettings, setIntegrationProvider } from "../db/integration-settings";
import type { IntegrationCategory } from "../integrations/types";

interface ExportedDeveloper {
  id: string;
  name: string;
  avatar: string;
  role: string;
  team: string;
  githubUsername?: string;
  atlassianEmail?: string;
}

interface ExportedDataSource {
  id: string;
  type: string;
  name: string;
  org: string;
  identifier: string;
  metadata: Record<string, unknown>;
}

interface ExportedConnection {
  id: string;
  email?: string;
  org?: string;
  connected: boolean;
}

interface ExportedDeveloperSources {
  developerId: string;
  sourceIds: string[];
}

interface ExportedIntegration {
  code: string;
  work: string;
  docs: string;
}

interface SettingsExport {
  version: number;
  exportedAt: string;
  connections: ExportedConnection[];
  dataSources: ExportedDataSource[];
  developers: ExportedDeveloper[];
  developerSources: ExportedDeveloperSources[];
  integration?: ExportedIntegration;
}

function buildExport(): SettingsExport {
  const developers = listDevelopers();
  const sources = listSources();
  const connections = listConnections();

  const developerSources: ExportedDeveloperSources[] = developers.map((dev) => ({
    developerId: dev.id,
    sourceIds: getSourcesForDeveloper(dev.id).map((s) => s.id),
  }));

  const integration = getIntegrationSettings();

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    integration: {
      code: integration.code,
      work: integration.work,
      docs: integration.docs,
    },
    connections: connections.map((c) => ({
      id: c.id,
      email: c.email,
      org: c.org,
      connected: c.connected,
    })),
    dataSources: sources.map((s) => ({
      id: s.id,
      type: s.type,
      name: s.name,
      org: s.org,
      identifier: s.identifier,
      metadata: s.metadata,
    })),
    developers: developers.map((d) => ({
      id: d.id,
      name: d.name,
      avatar: d.avatar,
      role: d.role,
      team: d.team,
      githubUsername: d.githubUsername,
      atlassianEmail: d.atlassianEmail,
    })),
    developerSources,
  };
}

function findDuplicateDeveloperNames(data: SettingsExport): string[] {
  const existing = listDevelopers();
  const existingNames = new Set(existing.map((d) => d.name.toLowerCase()));
  return data.developers
    .filter((d) => existingNames.has(d.name.toLowerCase()))
    .map((d) => d.name);
}

function performImport(data: SettingsExport, overwriteDuplicates: boolean): void {
  const existingDevelopers = listDevelopers();
  const existingByName = new Map(existingDevelopers.map((d) => [d.name.toLowerCase(), d]));

  const existingSources = listSources();
  const existingSourceByKey = new Map(
    existingSources.map((s) => [`${s.type}:${s.identifier}`, s])
  );

  // Map from imported source ID → actual source ID in DB
  const sourceIdMap = new Map<string, string>();

  // Upsert data sources (no secrets involved)
  for (const src of data.dataSources) {
    const key = `${src.type}:${src.identifier}`;
    const existing = existingSourceByKey.get(key);
    if (existing) {
      sourceIdMap.set(src.id, existing.id);
    } else {
      const created = createSource({
        type: src.type as DataSource["type"],
        name: src.name,
        org: src.org,
        identifier: src.identifier,
        metadata: src.metadata,
      });
      sourceIdMap.set(src.id, created.id);
    }
  }

  // Map from imported developer ID → actual developer ID in DB
  const developerIdMap = new Map<string, string>();

  for (const dev of data.developers) {
    const existing = existingByName.get(dev.name.toLowerCase());
    if (existing) {
      if (overwriteDuplicates) {
        updateDeveloper(existing.id, {
          name: dev.name,
          role: dev.role,
          team: dev.team,
          githubUsername: dev.githubUsername,
          atlassianEmail: dev.atlassianEmail,
        });
      }
      developerIdMap.set(dev.id, existing.id);
    } else {
      const created = createDeveloper({
        name: dev.name,
        role: dev.role,
        team: dev.team,
        githubUsername: dev.githubUsername,
        atlassianEmail: dev.atlassianEmail,
      });
      developerIdMap.set(dev.id, created.id);
    }
  }

  // Restore developer-source associations
  for (const ds of data.developerSources) {
    const actualDevId = developerIdMap.get(ds.developerId);
    if (!actualDevId) continue;
    const actualSourceIds = ds.sourceIds
      .map((sid) => sourceIdMap.get(sid))
      .filter((id): id is string => !!id);
    if (actualSourceIds.length > 0) {
      setSourcesForDeveloper(actualDevId, actualSourceIds);
    }
  }

  // Update connection metadata (email/org only — no secrets)
  for (const conn of data.connections) {
    if (conn.id !== "github" && conn.id !== "atlassian" && conn.id !== "linear") continue;
    saveConnection(conn.id as ConnectionId, {
      email: conn.email,
      org: conn.org,
      // never import `connected` state or tokens
    });
  }

  if (data.integration && data.version >= 2) {
    const integ = data.integration;
    const apply = (cat: IntegrationCategory, pid: string) => {
      try {
        setIntegrationProvider(cat, pid);
      } catch {
        /* ignore invalid provider ids from older exports */
      }
    };
    if (integ.code) apply("code", integ.code);
    if (integ.work) apply("work", integ.work);
    if (integ.docs) apply("docs", integ.docs);
  }
}

export async function runExportSettings(win: BrowserWindow | null): Promise<void> {
  const { filePath, canceled } = await dialog.showSaveDialog(win!, {
    title: "Export Settings",
    defaultPath: path.join(app.getPath("documents"), "devdash-settings.json"),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePath) return;

  const data = buildExport();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function runImportSettings(win: BrowserWindow | null): Promise<void> {
  const { filePaths, canceled } = await dialog.showOpenDialog(win!, {
    title: "Import Settings",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (canceled || filePaths.length === 0) return;

  let data: SettingsExport;
  try {
    const raw = fs.readFileSync(filePaths[0], "utf-8");
    data = JSON.parse(raw) as SettingsExport;
  } catch {
    await dialog.showErrorBox("Import Failed", "The selected file could not be read or parsed.");
    return;
  }

  if (
    (data.version !== 1 && data.version !== 2) ||
    !Array.isArray(data.developers) ||
    !Array.isArray(data.dataSources)
  ) {
    await dialog.showErrorBox("Import Failed", "The file does not appear to be a valid DevDash settings export.");
    return;
  }

  const duplicates = findDuplicateDeveloperNames(data);
  let overwrite = false;

  if (duplicates.length > 0) {
    const list = duplicates.slice(0, 10).join("\n");
    const extra = duplicates.length > 10 ? `\n…and ${duplicates.length - 10} more` : "";
    const { response } = await dialog.showMessageBox(win!, {
      type: "question",
      title: "Duplicate Developers Found",
      message: "Some developers in the import already exist",
      detail: `The following developers already exist:\n${list}${extra}\n\nDo you want to overwrite them with the imported data?`,
      buttons: ["Overwrite", "Skip Duplicates", "Cancel"],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 2) return;
    overwrite = response === 0;
  }

  try {
    performImport(data, overwrite);
  } catch (err: unknown) {
    await dialog.showErrorBox("Import Failed", (err as Error).message);
  }
}

export function registerSettingsIOHandlers(_getWindow: () => BrowserWindow | null) {
  // No additional IPC handlers needed — export/import are driven from the menu in main.ts
  void ipcMain; // keep import alive for potential future use
}
