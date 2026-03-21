import { useState } from "react";
import { ChevronDown, Check, Plus, Pencil } from "lucide-react";
import { clsx } from "clsx";
import { Dialog } from "@/components/ui/Dialog";
import { DeveloperForm } from "@/components/dashboard/DeveloperForm";
import { invoke } from "@/lib/api";
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
  const [addOpen, setAddOpen] = useState(false);
  const [editDev, setEditDev] = useState<Developer | null>(null);

  const selected = developers.find((d) => d.id === selectedId);

  async function handleAdd(values: { name: string; role: string; team: string; githubUsername: string; atlassianEmail: string }) {
    const newDev = await invoke<Developer>("developers:create", values);
    setAddOpen(false);
    await onDevelopersChange();
    onSelect(newDev.id);
  }

  async function handleEdit(values: { name: string; role: string; team: string; githubUsername: string; atlassianEmail: string }) {
    if (!editDev) return;
    await invoke("developers:update", { id: editDev.id, ...values });
    setEditDev(null);
    await onDevelopersChange();
  }

  async function handleDelete() {
    if (!editDev) return;
    await invoke("developers:delete", { id: editDev.id });
    setEditDev(null);
    await onDevelopersChange();
    // Select first remaining developer
    const remaining = developers.filter((d) => d.id !== editDev.id);
    if (remaining.length > 0) onSelect(remaining[0].id);
  }

  return (
    <>
      <header className="flex items-center justify-between px-6 h-14 bg-[var(--surface-container-low)] shrink-0 relative z-20">
        <h1 className="text-sm font-semibold text-[var(--on-surface-variant)] font-label tracking-widest uppercase">
          {title ?? "Developer Performance"}
        </h1>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-[var(--surface-container)] hover:bg-[var(--surface-container-high)] transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-[var(--primary-container)] flex items-center justify-center text-[10px] font-bold text-[var(--on-primary)] font-label">
              {selected?.avatar ?? "?"}
            </div>
            <span className="text-sm font-medium text-[var(--on-surface)]">
              {selected?.name ?? "Select developer"}
            </span>
            <ChevronDown
              size={14}
              className={clsx(
                "text-[var(--on-surface-variant)] transition-transform",
                open && "rotate-180"
              )}
            />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--surface-container-highest)] rounded-md shadow-lg overflow-hidden">
              {developers.map((dev) => (
                <div
                  key={dev.id}
                  className="flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--surface-bright)] transition-colors group"
                >
                  <button
                    onClick={() => { onSelect(dev.id); setOpen(false); }}
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                  >
                    <div className="w-7 h-7 rounded-full bg-[var(--primary-container)] flex items-center justify-center text-[10px] font-bold text-[var(--on-primary)] font-label shrink-0">
                      {dev.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--on-surface)] truncate">{dev.name}</div>
                      <div className="text-xs text-[var(--on-surface-variant)] truncate">{dev.role}</div>
                    </div>
                    {dev.id === selectedId && (
                      <Check size={14} className="text-[var(--primary)] shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditDev(dev); setOpen(false); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--surface-container-highest)] text-[var(--on-surface-variant)]"
                    title="Edit developer"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              ))}

              <div className="border-t border-[var(--outline-variant)]/20 p-2">
                <button
                  onClick={() => { setOpen(false); setAddOpen(true); }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-[var(--surface-bright)] transition-colors text-[var(--primary)] text-sm font-medium"
                >
                  <Plus size={14} />
                  Add Developer
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Add Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add Developer">
        <DeveloperForm
          onSubmit={handleAdd}
          onCancel={() => setAddOpen(false)}
          submitLabel="Add Developer"
        />
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDev} onClose={() => setEditDev(null)} title="Edit Developer">
        {editDev && (
          <DeveloperForm
            initial={editDev}
            onSubmit={handleEdit}
            onCancel={() => setEditDev(null)}
            onDelete={handleDelete}
            submitLabel="Save Changes"
          />
        )}
      </Dialog>
    </>
  );
}
