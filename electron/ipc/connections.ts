import { ipcMain } from "electron";
import { listConnections, getConnection, saveConnection, deleteConnection } from "../db/connections";
import type { ConnectionId } from "../db/connections";

function maskToken(conn: Record<string, unknown> & { token?: string | null }) {
  return { ...conn, token: conn.token ? "••••••••••••••••" : undefined };
}

function mask(conn: { token?: string | null }) {
  return { ...conn, token: conn.token ? "••••••••••••••••" : undefined };
}

export function registerConnectionHandlers() {
  ipcMain.handle("connections:list", () => {
    return listConnections().map(mask);
  });

  ipcMain.handle("connections:get", (_e, data: { id: string }) => {
    const conn = getConnection(data.id as ConnectionId);
    if (!conn) throw new Error("Not found");
    return mask(conn);
  });

  ipcMain.handle("connections:upsert", (_e, data: { id: string; token?: string; email?: string; org?: string; connected?: boolean }) => {
    const { id, token, email, org, connected } = data;
    if (id !== "github" && id !== "atlassian" && id !== "linear") throw new Error("Invalid connection id");
    const tokenToSave = token && !token.startsWith("••") ? token : undefined;
    const conn = saveConnection(id as ConnectionId, { token: tokenToSave, email, org, connected });
    return mask(conn);
  });

  ipcMain.handle("connections:delete", (_e, data: { id: string }) => {
    const deleted = deleteConnection(data.id as ConnectionId);
    if (!deleted) throw new Error("Not found");
    return { success: true };
  });
}
