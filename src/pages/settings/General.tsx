"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { invoke } from "@/lib/api";
import { useUpdate } from "@/context/UpdateContext";
import type { UpdateCheckResponse } from "@/lib/types";

export default function General() {
  const { offerUpdate, refreshAutoUpdatePref } = useUpdate();
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [syncToMacOS, setSyncToMacOS] = useState(false);
  const [macOSAvailable, setMacOSAvailable] = useState(false);
  const [macOSLoading, setMacOSLoading] = useState(true);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadPref = useCallback(async () => {
    try {
      const v = await invoke<string | null>("app-config:get", { key: "auto_update_enabled" });
      setAutoEnabled(v !== "0");
    } catch {
      setAutoEnabled(true);
    } finally {
      setPrefLoading(false);
    }
  }, []);

  const loadMacOSConfig = useCallback(async () => {
    try {
      const res = await invoke<{ syncToMacOS: boolean; macOSAvailable: boolean }>("reminders:config:get");
      setSyncToMacOS(res.syncToMacOS);
      setMacOSAvailable(res.macOSAvailable);
    } catch {
      setMacOSAvailable(false);
    } finally {
      setMacOSLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPref();
    void loadMacOSConfig();
  }, [loadPref, loadMacOSConfig]);

  const onToggleAutoUpdate = async (checked: boolean) => {
    setToggleBusy(true);
    const prev = autoEnabled;
    setAutoEnabled(checked);
    try {
      await invoke("app-config:set", { key: "auto_update_enabled", value: checked ? "1" : "0" });
      await refreshAutoUpdatePref();
    } catch {
      setAutoEnabled(prev);
    } finally {
      setToggleBusy(false);
    }
  };

  const checkNow = async () => {
    setCheckBusy(true);
    setCheckMessage(null);
    try {
      const r = await invoke<UpdateCheckResponse>("updates:check");
      if (r.status === "up-to-date") {
        setCheckMessage("You're on the latest version.");
      } else if (r.status === "available") {
        offerUpdate(r.version);
      } else if (r.status === "skipped") {
        setCheckMessage(
          r.reason === "development"
            ? "Update checks run in the packaged app only."
            : `Update check skipped (${r.reason}).`,
        );
      } else {
        setCheckMessage(r.message);
      }
    } catch (e) {
      setCheckMessage(e instanceof Error ? e.message : "Update check failed.");
    } finally {
      setCheckBusy(false);
    }
  };

  const onToggleMacOSSync = async (checked: boolean) => {
    const prev = syncToMacOS;
    setSyncToMacOS(checked);
    try {
      await invoke("reminders:config:set", { syncToMacOS: checked });
    } catch {
      setSyncToMacOS(prev);
    }
  };

  const onSyncNow = async () => {
    setSyncingNow(true);
    setSyncMessage(null);
    try {
      await invoke("reminders:sync-now");
      setSyncMessage("Sync completed successfully");
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      setSyncMessage(`Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSyncingNow(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl flex flex-col gap-5">
        <Card>
          <div className="flex items-center gap-2 min-w-0 mb-3">
            <SlidersHorizontal size={18} className="text-[var(--on-surface)] shrink-0" />
            <h3 className="text-base font-semibold text-[var(--on-surface)]">Updates</h3>
          </div>
          <p className="text-xs font-label text-[var(--on-surface-variant)] mb-4">
            When enabled, DevDash checks for new releases periodically and shows a notice in the status bar when an
            update is available.
          </p>

          <label className="flex items-start gap-3 cursor-pointer select-none mb-4">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-[var(--outline-variant)]"
              checked={autoEnabled}
              disabled={prefLoading || toggleBusy}
              onChange={(e) => void onToggleAutoUpdate(e.target.checked)}
            />
            <span className="text-sm text-[var(--on-surface)]">
              Enable automatic update checks
              <span className="block text-xs font-label text-[var(--on-surface-variant)] mt-0.5">
                On by default. Turn off to stop background checks; you can still check manually below.
              </span>
            </span>
          </label>

          <button
            type="button"
            disabled={checkBusy}
            onClick={() => void checkNow()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--surface-container-high)] text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)] disabled:opacity-50 transition-colors"
          >
            {checkBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Check for updates now
          </button>

          {checkMessage && (
            <p className="text-xs font-label text-[var(--on-surface-variant)] mt-3">{checkMessage}</p>
          )}
        </Card>

        {macOSAvailable && !macOSLoading && (
          <Card>
            <div className="flex items-center gap-2 min-w-0 mb-3">
              <SlidersHorizontal size={18} className="text-[var(--on-surface)] shrink-0" />
              <h3 className="text-base font-semibold text-[var(--on-surface)]">Reminders</h3>
            </div>
            <p className="text-xs font-label text-[var(--on-surface-variant)] mb-4">
              Integrate DevDash reminders with the macOS Reminders app for system-wide notifications.
            </p>

            <label className="flex items-start gap-3 cursor-pointer select-none mb-4">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[var(--outline-variant)]"
                checked={syncToMacOS}
                onChange={(e) => void onToggleMacOSSync(e.target.checked)}
              />
              <span className="text-sm text-[var(--on-surface)]">
                Sync triggered reminders to macOS Reminders
                <span className="block text-xs font-label text-[var(--on-surface-variant)] mt-0.5">
                  When a reminder triggers in DevDash, it will also be created in your macOS Reminders app in a "DevDash" list.
                </span>
              </span>
            </label>

            <button
              className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-container)] hover:bg-[var(--surface-container-high)] text-[var(--on-surface)] rounded-lg text-sm font-label transition disabled:opacity-50"
              onClick={() => void onSyncNow()}
              disabled={syncingNow || !syncToMacOS}
            >
              {syncingNow ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Sync now (check macOS completions)
            </button>

            {syncMessage && (
              <p className="text-xs font-label text-[var(--on-surface-variant)] mt-3">{syncMessage}</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
