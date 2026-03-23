import { ipcMain } from "electron";
import { listDevelopers, createDeveloper, updateDeveloper, deleteDeveloper, getDeveloper } from "../db/developers";
import { getSourcesForDeveloper, setSourcesForDeveloper } from "../db/sources";

export function registerDeveloperHandlers() {
  ipcMain.handle("developers:list", () => listDevelopers());

  ipcMain.handle("developers:create", (_e, data: { name: string; role: string; team: string; isCurrentUser?: boolean; githubUsername?: string; atlassianEmail?: string }) => {
    if (!data.name?.trim() || !data.role?.trim() || !data.team?.trim()) throw new Error("name, role, and team are required");
    return createDeveloper({
      name: data.name.trim(),
      role: data.role.trim(),
      team: data.team.trim(),
      isCurrentUser: typeof data.isCurrentUser === "boolean" ? data.isCurrentUser : undefined,
      githubUsername: data.githubUsername,
      atlassianEmail: data.atlassianEmail,
    });
  });

  ipcMain.handle("developers:update", (_e, data: { id: string; name?: string; role?: string; team?: string; isCurrentUser?: boolean; githubUsername?: string; atlassianEmail?: string }) => {
    const { id, ...rest } = data;
    const dev = updateDeveloper(id, rest);
    if (!dev) throw new Error("Not found");
    return dev;
  });

  ipcMain.handle("developers:delete", (_e, data: { id: string }) => {
    const deleted = deleteDeveloper(data.id);
    if (!deleted) throw new Error("Not found");
    return { success: true };
  });

  ipcMain.handle("developers:get", (_e, data: { id: string }) => {
    const dev = getDeveloper(data.id);
    if (!dev) throw new Error("Not found");
    return dev;
  });

  ipcMain.handle("developers:sources:get", (_e, data: { id: string }) => {
    return getSourcesForDeveloper(data.id);
  });

  ipcMain.handle("developers:sources:set", (_e, data: { id: string; sourceIds: string[] }) => {
    setSourcesForDeveloper(data.id, data.sourceIds);
    return getSourcesForDeveloper(data.id);
  });
}
