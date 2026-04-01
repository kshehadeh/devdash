import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Users } from "lucide-react";
import { clsx } from "clsx";
import { ManageDevelopersModal } from "@/components/dashboard/ManageDevelopersModal";
import { AppWindowHeader } from "@/components/layout/AppWindowHeader";
import type { Developer } from "@/lib/types";

interface TopBarProps {
  developers: Developer[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDevelopersChange: () => void;
  title?: string;
}

export function TopBar({ developers, selectedId, onSelect, onDevelopersChange, title }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = developers.find((d) => d.id === selectedId);
  const groupedDevelopers = developers
    .slice()
    .sort((a, b) => {
      const teamA = (a.team || "Unassigned").toLowerCase();
      const teamB = (b.team || "Unassigned").toLowerCase();
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      return a.name.localeCompare(b.name);
    })
    .reduce<Record<string, Developer[]>>((acc, dev) => {
      const team = dev.team?.trim() || "Unassigned";
      if (!acc[team]) acc[team] = [];
      acc[team].push(dev);
      return acc;
    }, {});

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <>
      <AppWindowHeader
        start={
          <h1 className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
            {title ?? "Developer Performance"}
          </h1>
        }
        end={
          <div className="relative ml-1" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-[var(--surface-container)] hover:bg-[var(--surface-container-high)] transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-[var(--primary-container)] flex items-center justify-center text-[10px] font-bold text-[var(--on-primary)] font-label">
                {selected?.avatar ?? "?"}
              </div>
              <span className="text-sm font-medium text-[var(--on-surface)]">
                {selected?.name ?? "Select developer"}
              </span>
              {selected?.isCurrentUser && (
                <span className="text-[10px] font-label tracking-wide px-1.5 py-0.5 rounded bg-[var(--primary)]/15 text-[var(--primary)]">
                  YOU
                </span>
              )}
              <ChevronDown
                size={14}
                className={clsx(
                  "text-[var(--on-surface-variant)] transition-transform",
                  open && "rotate-180"
                )}
              />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-[var(--surface-container-highest)] rounded-md shadow-lg overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto">
                  {Object.entries(groupedDevelopers).map(([team, teamDevelopers]) => (
                    <div key={team} className="py-1">
                      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-[var(--on-surface-variant)] font-label">
                        {team}
                      </div>
                      {teamDevelopers.map((dev) => (
                        <button
                          key={dev.id}
                          onClick={() => { onSelect(dev.id); setOpen(false); }}
                          className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[var(--surface-bright)] transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-full bg-[var(--primary-container)] flex items-center justify-center text-[10px] font-bold text-[var(--on-primary)] font-label shrink-0">
                            {dev.avatar}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[var(--on-surface)] truncate flex items-center gap-1.5">
                              <span className="truncate">{dev.name}</span>
                              {dev.isCurrentUser && (
                                <span className="text-[9px] font-label tracking-wide px-1.5 py-0.5 rounded bg-[var(--primary)]/15 text-[var(--primary)] shrink-0">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--on-surface-variant)] truncate">{dev.role}</div>
                          </div>
                          {dev.id === selectedId && (
                            <Check size={14} className="text-[var(--primary)] shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="border-t border-[var(--outline-variant)]/20 p-2">
                  <button
                    onClick={() => { setOpen(false); setManageModalOpen(true); }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-[var(--surface-bright)] transition-colors text-[var(--primary)] text-sm font-medium"
                  >
                    <Users size={14} />
                    Manage Developers…
                  </button>
                </div>
              </div>
            )}
          </div>
        }
      />

      <ManageDevelopersModal
        open={manageModalOpen}
        onClose={() => setManageModalOpen(false)}
        onDevelopersChange={async () => onDevelopersChange()}
        onSelect={onSelect}
      />
    </>
  );
}
