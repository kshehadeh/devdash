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
import { listAllDeveloperIntegrationIdentities, upsertDeveloperIntegrationIdentity } from "../db/developer-identity";

interface ExportedDeveloper {
  id: string;
  name: string;
  avatar: string;
  role: string;
  team: string;
  githubUsername?: string;
  atlassianEmail?: string;
  /** Export format v3+ */
  isCurrentUser?: boolean;
}

interface ExportedDataSource {
  id: string;
  type: string;
  name: string;
  org: string;
  identifier: string;
  metadata: Record<string, unknown>;
  providerId?: string | null;
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

interface ExportedDeveloperIdentity {
  developerId: string;
  category: string;
  providerId: string;
  payload: Record<string, unknown>;
}

interface SettingsExport {
  version: number;
  exportedAt: string;
  connections: ExportedConnection[];
  dataSources: ExportedDataSource[];
  developers: ExportedDeveloper[];
  developerSources: ExportedDeveloperSources[];
  integration?: ExportedIntegration;
  /** Export format v3+ */
  developerIdentities?: ExportedDeveloperIdentity[];
}

type ImportOutcome =
  | "created"
  | "updated"
  | "skipped_duplicate"
  | "reused_existing"
  | "applied"
  | "skipped";

export interface ImportLine {
  kind: "developer" | "dataSource" | "connection" | "integration" | "developerSources" | "developerIdentity";
  label: string;
  outcome: ImportOutcome;
  reason?: string;
}

export interface SettingsImportResult {
  lines: ImportLine[];
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
  const developerIdentities = listAllDeveloperIntegrationIdentities().map((row) => ({
    developerId: row.developerId,
    category: row.category,
    providerId: row.providerId,
    payload: row.payload,
  }));

  return {
    version: 3,
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
      providerId: s.providerId ?? undefined,
    })),
    developers: developers.map((d) => ({
      id: d.id,
      name: d.name,
      avatar: d.avatar,
      role: d.role,
      team: d.team,
      githubUsername: d.githubUsername,
      atlassianEmail: d.atlassianEmail,
      isCurrentUser: d.isCurrentUser,
    })),
    developerSources,
    developerIdentities,
  };
}

function findDuplicateDeveloperNames(data: SettingsExport): string[] {
  const existing = listDevelopers();
  const existingNames = new Set(existing.map((d) => d.name.toLowerCase()));
  return data.developers
    .filter((d) => existingNames.has(d.name.toLowerCase()))
    .map((d) => d.name);
}

const SECTION_ORDER: ImportLine["kind"][] = [
  "developer",
  "dataSource",
  "developerSources",
  "developerIdentity",
  "connection",
  "integration",
];

const SECTION_TITLE: Record<ImportLine["kind"], string> = {
  developer: "Developers",
  dataSource: "Data sources",
  developerSources: "Developer ↔ data source links",
  developerIdentity: "Developer integration identity",
  connection: "Connections (email/org metadata only)",
  integration: "Integration providers",
};

function outcomeVerb(outcome: ImportOutcome): string {
  switch (outcome) {
    case "created":
      return "Created";
    case "updated":
      return "Updated";
    case "skipped_duplicate":
      return "Skipped (duplicate)";
    case "reused_existing":
      return "Reused existing";
    case "applied":
      return "Applied";
    case "skipped":
      return "Skipped";
    default:
      return outcome;
  }
}

function formatImportReport(result: SettingsImportResult): string {
  const byKind = new Map<ImportLine["kind"], ImportLine[]>();
  for (const k of SECTION_ORDER) byKind.set(k, []);
  for (const line of result.lines) {
    byKind.get(line.kind)!.push(line);
  }

  const parts: string[] = [];
  for (const kind of SECTION_ORDER) {
    const lines = byKind.get(kind)!;
    if (lines.length === 0) continue;
    parts.push(SECTION_TITLE[kind]);
    for (const line of lines) {
      const why = line.reason ? ` — ${line.reason}` : "";
      parts.push(`  • ${outcomeVerb(line.outcome)}: ${line.label}${why}`);
    }
    parts.push("");
  }
  return parts.join("\n").trimEnd();
}

function defaultProviderForCategory(cat: IntegrationCategory): string {
  if (cat === "code") return "github";
  if (cat === "work") return "jira";
  return "confluence";
}

function parseIdentityCategory(c: string): IntegrationCategory | null {
  if (c === "code" || c === "work" || c === "docs") return c;
  return null;
}

function performImport(data: SettingsExport, overwriteDuplicates: boolean): SettingsImportResult {
  const lines: ImportLine[] = [];
  const existingDevelopers = listDevelopers();
  const existingByName = new Map(existingDevelopers.map((d) => [d.name.toLowerCase(), d]));

  const existingSources = listSources();
  const existingSourceByKey = new Map(
    existingSources.map((s) => [`${s.type}:${s.identifier}`, s]),
  );

  const sourceIdMap = new Map<string, string>();
  const skippedImportedDeveloperIds = new Set<string>();
  const importedDevNameById = new Map(data.developers.map((d) => [d.id, d.name]));

  for (const src of data.dataSources) {
    const key = `${src.type}:${src.identifier}`;
    const existing = existingSourceByKey.get(key);
    const label = `${src.type}: ${src.name || src.identifier}`;
    if (existing) {
      sourceIdMap.set(src.id, existing.id);
      lines.push({
        kind: "dataSource",
        label,
        outcome: "reused_existing",
        reason: "Same type and identifier already exists; kept existing row (including provider).",
      });
    } else {
      const created = createSource({
        type: src.type as DataSource["type"],
        name: src.name,
        org: src.org,
        identifier: src.identifier,
        metadata: src.metadata,
        providerId: src.providerId !== undefined && src.providerId !== null && src.providerId !== "" ? src.providerId : undefined,
      });
      sourceIdMap.set(src.id, created.id);
      lines.push({ kind: "dataSource", label, outcome: "created" });
    }
  }

  const developerIdMap = new Map<string, string>();

  for (const dev of data.developers) {
    const existing = existingByName.get(dev.name.toLowerCase());
    if (existing) {
      if (overwriteDuplicates) {
        const patch: {
          name?: string;
          role?: string;
          team?: string;
          isCurrentUser?: boolean;
          githubUsername?: string;
          atlassianEmail?: string;
        } = {
          name: dev.name,
          role: dev.role,
          team: dev.team,
          githubUsername: dev.githubUsername,
          atlassianEmail: dev.atlassianEmail,
        };
        if (data.version >= 3 && typeof dev.isCurrentUser === "boolean") {
          patch.isCurrentUser = dev.isCurrentUser;
        }
        updateDeveloper(existing.id, patch);
        developerIdMap.set(dev.id, existing.id);
        lines.push({
          kind: "developer",
          label: dev.name,
          outcome: "updated",
          reason: "Matched by name; replaced with values from the import file.",
        });
      } else {
        developerIdMap.set(dev.id, existing.id);
        skippedImportedDeveloperIds.add(dev.id);
        lines.push({
          kind: "developer",
          label: dev.name,
          outcome: "skipped_duplicate",
          reason: "A developer with this name already exists.",
        });
      }
    } else {
      const created = createDeveloper({
        name: dev.name,
        role: dev.role,
        team: dev.team,
        githubUsername: dev.githubUsername,
        atlassianEmail: dev.atlassianEmail,
        isCurrentUser: data.version >= 3 && typeof dev.isCurrentUser === "boolean" ? dev.isCurrentUser : undefined,
      });
      developerIdMap.set(dev.id, created.id);
      lines.push({ kind: "developer", label: dev.name, outcome: "created" });
    }
  }

  for (const ds of data.developerSources) {
    const actualDevId = developerIdMap.get(ds.developerId);
    if (!actualDevId) continue;
    const devName = importedDevNameById.get(ds.developerId) ?? ds.developerId;

    if (skippedImportedDeveloperIds.has(ds.developerId)) {
      lines.push({
        kind: "developerSources",
        label: devName,
        outcome: "skipped",
        reason: "Duplicate developer was skipped; kept existing data source assignments.",
      });
      continue;
    }

    const actualSourceIds = ds.sourceIds.map((sid) => sourceIdMap.get(sid)).filter((id): id is string => !!id);
    if (actualSourceIds.length > 0) {
      setSourcesForDeveloper(actualDevId, actualSourceIds);
      lines.push({
        kind: "developerSources",
        label: `${devName} (${actualSourceIds.length} source${actualSourceIds.length === 1 ? "" : "s"})`,
        outcome: "applied",
      });
    }
  }

  for (const conn of data.connections) {
    if (conn.id !== "github" && conn.id !== "atlassian" && conn.id !== "linear") {
      lines.push({
        kind: "connection",
        label: conn.id,
        outcome: "skipped",
        reason: "Only GitHub, Atlassian, and Linear connection metadata can be imported.",
      });
      continue;
    }
    saveConnection(conn.id as ConnectionId, {
      email: conn.email,
      org: conn.org,
    });
    lines.push({
      kind: "connection",
      label: conn.id,
      outcome: "applied",
      reason: "Email/org fields updated; tokens and connected state were not changed.",
    });
  }

  if (data.integration && data.version >= 2) {
    const integ = data.integration;
    const tryApply = (cat: IntegrationCategory, pid: string | undefined, short: string) => {
      if (!pid?.trim()) {
        lines.push({
          kind: "integration",
          label: short,
          outcome: "skipped",
          reason: "Not set in export file.",
        });
        return;
      }
      try {
        setIntegrationProvider(cat, pid);
        lines.push({
          kind: "integration",
          label: `${short} (${pid})`,
          outcome: "applied",
        });
      } catch {
        lines.push({
          kind: "integration",
          label: `${short} (${pid})`,
          outcome: "skipped",
          reason: "Invalid provider for this app version.",
        });
      }
    };
    tryApply("code", integ.code, "Code");
    tryApply("work", integ.work, "Work");
    tryApply("docs", integ.docs, "Docs");
  } else if (data.version < 2) {
    lines.push({
      kind: "integration",
      label: "Integration providers",
      outcome: "skipped",
      reason: "Not included in v1 export format.",
    });
  } else {
    lines.push({
      kind: "integration",
      label: "Integration providers",
      outcome: "skipped",
      reason: "No integration block in this file.",
    });
  }

  if (data.version >= 3 && Array.isArray(data.developerIdentities)) {
    for (const row of data.developerIdentities) {
      const devName = importedDevNameById.get(row.developerId) ?? row.developerId;
      const cat = parseIdentityCategory(row.category);
      if (!cat) {
        lines.push({
          kind: "developerIdentity",
          label: devName,
          outcome: "skipped",
          reason: `Unknown category "${row.category}".`,
        });
        continue;
      }
      if (skippedImportedDeveloperIds.has(row.developerId)) {
        lines.push({
          kind: "developerIdentity",
          label: `${devName} (${cat})`,
          outcome: "skipped",
          reason: "Duplicate developer was skipped; kept existing integration identity.",
        });
        continue;
      }
      const actualDevId = developerIdMap.get(row.developerId);
      if (!actualDevId) {
        lines.push({
          kind: "developerIdentity",
          label: `${devName} (${cat})`,
          outcome: "skipped",
          reason: "Developer id from file was not mapped.",
        });
        continue;
      }
      const payload =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {};
      const pid = row.providerId?.trim() || defaultProviderForCategory(cat);
      upsertDeveloperIntegrationIdentity(actualDevId, cat, pid, payload);
      lines.push({
        kind: "developerIdentity",
        label: `${devName} (${cat})`,
        outcome: "applied",
      });
    }
  }

  return { lines };
}

function isValidExportVersion(v: unknown): v is number {
  return v === 1 || v === 2 || v === 3;
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
    !isValidExportVersion(data.version) ||
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
      message: "Some developers in the import already exist (matched by name).",
      detail: `The following names already exist:\n${list}${extra}\n\nOverwrite: replace their roles, team, emails, GitHub username, “you” flag (v3+), then apply data sources and identity from this file.\nSkip: keep existing developer records and assignments; import everything else.\n\nYou will see a full import report when this finishes.`,
      buttons: ["Overwrite", "Skip duplicates", "Cancel"],
      defaultId: 1,
      cancelId: 2,
    });
    if (response === 2) return;
    overwrite = response === 0;
  }

  try {
    const result = performImport(data, overwrite);
    const detail = formatImportReport(result);
    await dialog.showMessageBox(win!, {
      type: "info",
      title: "Import complete",
      message: "Settings import finished. Review the details below.",
      detail: detail || "No changes were recorded.",
    });
  } catch (err: unknown) {
    await dialog.showErrorBox("Import Failed", (err as Error).message);
  }
}

export function registerSettingsIOHandlers(_getWindow: () => BrowserWindow | null) {
  void ipcMain;
}
