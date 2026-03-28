import type { BrowserWindow } from "electron";
import { ipcMain, Menu } from "electron";

export interface ContextMenuContext {
  title: string;
  url: string | null;
  itemType: "pr" | "ticket" | "doc";
  notificationId?: string | null;
}

export interface ContextMenuAction {
  action: string;
  context: ContextMenuContext;
  remindAt?: string;
}

function buildRemindMeSubmenu(): Electron.MenuItemConstructorOptions[] {
  const now = new Date();
  const hour = now.getHours();
  
  const in1Hour = new Date(now);
  in1Hour.setHours(now.getHours() + 1);
  
  const laterToday3pm = new Date(now);
  laterToday3pm.setHours(15, 0, 0, 0);
  
  const laterToday5pm = new Date(now);
  laterToday5pm.setHours(17, 0, 0, 0);
  
  const tomorrow9am = new Date(now);
  tomorrow9am.setDate(now.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);
  
  const nextMonday9am = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  nextMonday9am.setDate(now.getDate() + daysUntilMonday);
  nextMonday9am.setHours(9, 0, 0, 0);

  const items: Electron.MenuItemConstructorOptions[] = [
    {
      id: "remind-1hour",
      label: "In 1 hour",
      click: () => {}, // Will be handled by parent
    },
    {
      id: "remind-tomorrow",
      label: "Tomorrow morning (9:00 AM)",
      click: () => {},
    },
    {
      id: "remind-nextweek",
      label: "Next week (Monday 9:00 AM)",
      click: () => {},
    },
  ];

  // Add "Later today" only if before 5pm
  if (hour < 17) {
    const laterTime = hour < 12 ? "3:00 PM" : "5:00 PM";
    items.splice(1, 0, {
      id: "remind-latertoday",
      label: `Later today (${laterTime})`,
      click: () => {},
    });
  }

  return items;
}

function getRemindAtTime(actionId: string): string {
  const now = new Date();
  const hour = now.getHours();

  switch (actionId) {
    case "remind-1hour": {
      const time = new Date(now);
      time.setHours(now.getHours() + 1);
      return time.toISOString();
    }
    case "remind-latertoday": {
      const time = new Date(now);
      time.setHours(hour < 12 ? 15 : 17, 0, 0, 0);
      return time.toISOString();
    }
    case "remind-tomorrow": {
      const time = new Date(now);
      time.setDate(now.getDate() + 1);
      time.setHours(9, 0, 0, 0);
      return time.toISOString();
    }
    case "remind-nextweek": {
      const time = new Date(now);
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      time.setDate(now.getDate() + daysUntilMonday);
      time.setHours(9, 0, 0, 0);
      return time.toISOString();
    }
    default:
      return new Date(now.getTime() + 3600000).toISOString();
  }
}

export function registerContextMenuHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle("context-menu:show", async (_event, data: { context: ContextMenuContext }) => {
    const win = getWindow();
    if (!win) return;

    const { context } = data;
    
    const remindMeSubmenu = buildRemindMeSubmenu();
    
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "Remind Me",
        submenu: remindMeSubmenu,
      },
    ];

    const menu = Menu.buildFromTemplate(template);

    // Attach click handlers to submenu items
    remindMeSubmenu.forEach((item) => {
      const menuItem = menu.getMenuItemById(item.id!);
      if (menuItem) {
        menuItem.click = () => {
          const remindAt = getRemindAtTime(item.id!);
          win.webContents.send("context-menu:action", {
            action: "remind-me",
            context,
            remindAt,
          });
        };
      }
    });

    menu.popup({ window: win });
  });
}
