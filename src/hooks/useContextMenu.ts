import { useCallback } from "react";
import { invoke, type ContextMenuContext } from "@/lib/api";

export type { ContextMenuContext };

// Hook for showing context menus - does NOT register global event listener
export function useContextMenu() {
  const showContextMenu = useCallback((context: ContextMenuContext) => {
    invoke("context-menu:show", { context }).catch((err) => {
      console.error("Failed to show context menu:", err);
    });
  }, []);

  return { showContextMenu };
}
