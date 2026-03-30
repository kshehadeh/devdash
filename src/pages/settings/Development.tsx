import { useEffect, useRef, useState } from "react";
import { FolderOpen, Terminal, Wrench } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { invoke, type ConsoleLogEntry, type ConsoleLogLevel } from "@/lib/api";

const LOG_BUFFER_LIMIT = 1000;

export default function Development() {
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [consoleError, setConsoleError] = useState<string | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState<Record<ConsoleLogLevel, boolean>>({
    log: true,
    warn: true,
    error: true,
  });
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    invoke<string>("dev:get-db-path")
      .then(setDbPath)
      .catch(() => setDbPath(null));
  }, []);

  useEffect(() => {
    setConsoleLoading(true);
    invoke<ConsoleLogEntry[]>("dev:get-console-logs")
      .then((entries) => {
        setConsoleLogs(entries);
        setConsoleError(null);
      })
      .catch(() => setConsoleError("Unable to load console logs."))
      .finally(() => setConsoleLoading(false));

    const unsubscribe = window.electron?.onConsoleLog?.((entry) => {
      setConsoleLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > LOG_BUFFER_LIMIT) {
          return next.slice(-LOG_BUFFER_LIMIT);
        }
        return next;
      });
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    const container = logContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [autoScroll, consoleLogs]);

  const revealDb = () => {
    void invoke("dev:reveal-db");
  };

  const toggleDevTools = () => {
    void invoke("dev:toggle-devtools");
  };

  const clearConsoleLogs = () => {
    void invoke("dev:clear-console-logs")
      .then(() => {
        setConsoleLogs([]);
        setConsoleError(null);
      })
      .catch(() => setConsoleError("Unable to clear console logs."));
  };

  const toggleLevel = (level: ConsoleLogLevel) => {
    setLevelFilter((prev) => ({ ...prev, [level]: !prev[level] }));
  };

  const filteredLogs = consoleLogs.filter((entry) => levelFilter[entry.level]);

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

        <Card>
          <div className="flex items-center gap-2 min-w-0 mb-3">
            <Terminal size={18} className="text-[var(--on-surface)] shrink-0" />
            <h3 className="text-base font-semibold text-[var(--on-surface)]">Console Output</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {(["log", "warn", "error"] as ConsoleLogLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => toggleLevel(level)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                  levelFilter[level]
                    ? "border-[var(--outline)] bg-[var(--surface-container-high)] text-[var(--on-surface)]"
                    : "border-[var(--surface-container-high)] bg-[var(--surface)] text-[var(--on-surface-variant)]"
                }`}
              >
                {level}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setAutoScroll((prev) => !prev)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                autoScroll
                  ? "border-[var(--outline)] bg-[var(--surface-container-high)] text-[var(--on-surface)]"
                  : "border-[var(--surface-container-high)] bg-[var(--surface)] text-[var(--on-surface-variant)]"
              }`}
            >
              Auto-scroll
            </button>

            <button
              type="button"
              onClick={clearConsoleLogs}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-[var(--surface-container-high)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] transition-colors"
            >
              Clear
            </button>
          </div>

          {consoleError ? (
            <div className="text-xs text-[var(--on-surface-variant)] mb-2">{consoleError}</div>
          ) : null}

          <div
            ref={logContainerRef}
            className="h-64 overflow-auto rounded-md border border-[var(--surface-container-high)] bg-[var(--surface-container-highest)] p-3 font-mono text-xs text-[var(--on-surface)]"
          >
            {consoleLoading ? (
              <div className="text-[var(--on-surface-variant)]">Loading console logs...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-[var(--on-surface-variant)]">No console logs yet.</div>
            ) : (
              filteredLogs.map((entry) => (
                <div key={entry.id} className="whitespace-pre-wrap break-words leading-relaxed">
                  <span className="text-[var(--on-surface-variant)]">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>{" "}
                  <span
                    className={
                      entry.level === "error"
                        ? "text-rose-300"
                        : entry.level === "warn"
                          ? "text-amber-300"
                          : "text-sky-300"
                    }
                  >
                    {entry.level.toUpperCase()}
                  </span>{" "}
                  <span className="text-[var(--on-surface-variant)]">[{entry.source}]</span>{" "}
                  <span>{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
