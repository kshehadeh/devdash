import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CommandPalette } from "@/components/CommandPalette";

interface CommandPaletteContextValue {
  openCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteStateProvider({
  children,
  developerId,
}: {
  children: ReactNode;
  developerId: string | null;
}) {
  const [open, setOpen] = useState(false);

  const openCommandPalette = useCallback(() => setOpen(true), []);
  const toggleCommandPalette = useCallback(() => setOpen((o) => !o), []);

  const value = useMemo(
    () => ({ openCommandPalette, toggleCommandPalette }),
    [openCommandPalette, toggleCommandPalette],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette developerId={developerId} open={open} onOpenChange={setOpen} />
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPaletteControls() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPaletteControls must be used within CommandPaletteStateProvider");
  }
  return ctx;
}
