"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { invoke } from "@/lib/api";
import type { NotificationPreference } from "@/lib/types";

interface NotificationConfig {
  enabled: boolean;
  pollIntervalMs: number;
}

const INTERVAL_OPTIONS = [
  { label: "1 minute", value: 60_000 },
  { label: "5 minutes", value: 300_000 },
  { label: "10 minutes", value: 600_000 },
  { label: "15 minutes", value: 900_000 },
  { label: "30 minutes", value: 1_800_000 },
];

export default function NotificationsSettings() {
  const [config, setConfig] = useState<NotificationConfig>({ enabled: true, pollIntervalMs: 600_000 });
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [cfg, prefs] = await Promise.all([
      invoke<NotificationConfig>("notifications:config:get"),
      invoke<{ preferences: NotificationPreference[] }>("notifications:preferences:get"),
    ]);
    setConfig(cfg);
    setPreferences(prefs.preferences);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveConfig(next: NotificationConfig) {
    setSaving(true);
    setConfig(next);
    try {
      await invoke("notifications:config:set", next);
    } finally {
      setSaving(false);
    }
  }

  async function onTogglePreference(pref: NotificationPreference, enabled: boolean) {
    const next = preferences.map((p) =>
      p.integration === pref.integration && p.notificationType === pref.notificationType
        ? { ...p, enabled }
        : p,
    );
    setPreferences(next);
    await invoke("notifications:preferences:set", {
      integration: pref.integration,
      notificationType: pref.notificationType,
      enabled,
      fingerprintStrategy: pref.fingerprintStrategy,
    });
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl flex flex-col gap-5">
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <BellRing size={18} className="text-[var(--on-surface)]" />
            <h3 className="text-base font-semibold text-[var(--on-surface)]">Notification Settings</h3>
          </div>
          <p className="text-xs font-label text-[var(--on-surface-variant)] mb-4">
            Receive desktop notifications for events from active integrations. Clicks open the details modal in-app.
          </p>

          <label className="flex items-start gap-3 cursor-pointer select-none mb-4">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-[var(--outline-variant)]"
              checked={config.enabled}
              disabled={saving}
              onChange={(e) => void saveConfig({ ...config, enabled: e.target.checked })}
            />
            <span className="text-sm text-[var(--on-surface)]">
              Enable notifications
              <span className="block text-xs font-label text-[var(--on-surface-variant)] mt-0.5">
                Turn off to stop polling and desktop alerts.
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wide">
              Poll Interval
            </label>
            <select
              value={config.pollIntervalMs}
              disabled={saving || !config.enabled}
              onChange={(e) => void saveConfig({ ...config, pollIntervalMs: Number(e.target.value) })}
              className="w-56 px-2 py-1.5 rounded-md bg-[var(--surface-container)] border border-[var(--outline-variant)]/30 text-sm text-[var(--on-surface)]"
            >
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-[var(--on-surface)] mb-3">Per-notification Controls</h3>
          {preferences.length === 0 ? (
            <p className="text-xs font-label text-[var(--on-surface-variant)]">
              Notification types appear after the first poll cycle.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--outline-variant)]/20">
              {preferences.map((pref) => (
                <label key={`${pref.integration}:${pref.notificationType}`} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm text-[var(--on-surface)]">
                      {pref.integration} / {pref.notificationType}
                    </p>
                    <p className="text-[10px] font-label text-[var(--on-surface-variant)] mt-0.5">
                      Fingerprint strategy is configurable in code.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="rounded border-[var(--outline-variant)]"
                    checked={pref.enabled}
                    disabled={!config.enabled}
                    onChange={(e) => void onTogglePreference(pref, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
