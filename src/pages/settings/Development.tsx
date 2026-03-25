import { useEffect, useState } from "react";
import { FolderOpen, Wrench } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { invoke } from "@/lib/api";

export default function Development() {
  const [dbPath, setDbPath] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("dev:get-db-path")
      .then(setDbPath)
      .catch(() => setDbPath(null));
  }, []);

  const revealDb = () => {
    void invoke("dev:reveal-db");
  };

  const toggleDevTools = () => {
    void invoke("dev:toggle-devtools");
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl flex flex-col gap-5">
        <Card>
          <div className="flex items-center gap-2 min-w-0 mb-3">
            <Wrench size={18} className="text-[var(--on-surface)] shrink-0" />
            <h3 className="text-base font-semibold text-[var(--on-surface)]">Development Settings</h3>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="text-xs font-semibold font-label text-[var(--on-surface-variant)] mb-1">
                Database Path
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-[var(--on-surface)] bg-[var(--surface-container-high)] px-3 py-2 rounded-md truncate">
                  {dbPath ?? "—"}
                </code>
                <button
                  type="button"
                  onClick={revealDb}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-[var(--surface-container-high)] text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)] transition-colors shrink-0"
                >
                  <FolderOpen size={14} />
                  Reveal In Finder
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold font-label text-[var(--on-surface-variant)] mb-1">
                Developer Tools
              </div>
              <button
                type="button"
                onClick={toggleDevTools}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--surface-container-high)] text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)] transition-colors"
              >
                Toggle DevTools Panel
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
