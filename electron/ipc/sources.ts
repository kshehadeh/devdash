import { ipcMain } from "electron";
import { listSources, createSource, getSource, updateSource, deleteSource } from "../db/sources";

export function registerSourceHandlers() {
  ipcMain.handle("sources:list", (_e, data?: { type?: string }) => {
    return listSources(data?.type as any);
  });

  ipcMain.handle("sources:create", (_e, data: { type: string; name: string; org?: string; identifier: string; metadata?: Record<string, unknown> }) => {
    if (!data.type || !data.name?.trim() || !data.identifier?.trim()) throw new Error("type, name, and identifier are required");
    return createSource({ type: data.type as any, name: data.name.trim(), org: (data.org ?? "").trim(), identifier: data.identifier.trim(), metadata: data.metadata });
  });

  ipcMain.handle("sources:get", (_e, data: { id: string }) => {
    const source = getSource(data.id);
    if (!source) throw new Error("Not found");
    return source;
  });

  ipcMain.handle("sources:upsert", (_e, data: { id: string; name?: string; org?: string; identifier?: string; metadata?: Record<string, unknown> }) => {
    const { id, ...rest } = data;
    const source = updateSource(id, rest);
    if (!source) throw new Error("Not found");
    return source;
  });

  ipcMain.handle("sources:delete", (_e, data: { id: string }) => {
    const deleted = deleteSource(data.id);
    if (!deleted) throw new Error("Not found");
    return { success: true };
  });
}
