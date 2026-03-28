"use client";

import { useState, useEffect } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import {
  type DashboardWidgetId,
  DASHBOARD_WIDGET_LABELS,
  DEFAULT_DASHBOARD_LAYOUT,
  layoutToJson,
  parseDashboardLayoutJson,
} from "@/lib/dashboard-widgets";
import { invoke } from "@/lib/api";

interface DashboardCustomizeDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function DashboardCustomizeDialog({ open, onClose, onSaved }: DashboardCustomizeDialogProps) {
  const [order, setOrder] = useState<DashboardWidgetId[]>([...DEFAULT_DASHBOARD_LAYOUT]);
  const [hidden, setHidden] = useState<Set<DashboardWidgetId>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const raw = await invoke<string | null>("app-config:get", { key: "dashboard_widget_layout_json" });
        const parsed = parseDashboardLayoutJson(raw ?? undefined);
        setOrder(parsed);
        const vis = new Set(parsed);
        setHidden(new Set(DEFAULT_DASHBOARD_LAYOUT.filter((id) => !vis.has(id))));
      } catch {
        setOrder([...DEFAULT_DASHBOARD_LAYOUT]);
        setHidden(new Set());
      }
    })();
  }, [open]);

  if (!open) return null;

  function toggle(id: DashboardWidgetId) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    setOrder((o) => {
      const copy = [...o];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  async function save() {
    const visible = order.filter((id) => !hidden.has(id));
    setSaving(true);
    try {
      await invoke("app-config:set", {
        key: "dashboard_widget_layout_json",
        value: layoutToJson(visible.length > 0 ? visible : [...DEFAULT_DASHBOARD_LAYOUT]),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[var(--surface-container-highest)] rounded-lg shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col border border-[var(--outline-variant)]/30">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--outline-variant)]/20">
          <h2 className="text-sm font-semibold text-[var(--on-surface)]">Customize dashboard</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface-container)]">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          <p className="text-xs text-[var(--on-surface-variant)] mb-3">
            Toggle sections and reorder. The metrics bar is usually best kept at the top.
          </p>
          {order.map((id, i) => (
            <div
              key={id}
              className="flex items-center gap-2 rounded-md border border-[var(--outline-variant)]/20 px-2 py-2 bg-[var(--surface-container)]"
            >
              <input
                type="checkbox"
                checked={!hidden.has(id)}
                onChange={() => toggle(id)}
                className="rounded border-[var(--outline-variant)]"
              />
              <span className="flex-1 text-xs text-[var(--on-surface)]">{DASHBOARD_WIDGET_LABELS[id]}</span>
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="p-0.5 disabled:opacity-30 hover:bg-[var(--surface-container-high)] rounded"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                  className="p-0.5 disabled:opacity-30 hover:bg-[var(--surface-container-high)] rounded"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--outline-variant)]/20">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-label rounded-md hover:bg-[var(--surface-container)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="px-3 py-1.5 text-xs font-label rounded-md bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
