"use client";

import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";

interface SnoozePopoverProps {
  onSnooze: (snoozedUntil: string) => void;
  onClose: () => void;
}

function getSnoozeTimes() {
  const now = new Date();

  const in15Min = new Date(now);
  in15Min.setMinutes(now.getMinutes() + 15);

  const in1Hour = new Date(now);
  in1Hour.setHours(now.getHours() + 1);

  const tomorrow9am = new Date(now);
  tomorrow9am.setDate(now.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);

  const nextMonday9am = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  nextMonday9am.setDate(now.getDate() + daysUntilMonday);
  nextMonday9am.setHours(9, 0, 0, 0);

  return [
    { label: "15 minutes", value: in15Min.toISOString() },
    { label: "1 hour", value: in1Hour.toISOString() },
    { label: "Tomorrow 9am", value: tomorrow9am.toISOString() },
    { label: "Next Monday 9am", value: nextMonday9am.toISOString() },
  ];
}

export function SnoozePopover({ onSnooze, onClose }: SnoozePopoverProps) {
  const [customTime, setCustomTime] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const presets = getSnoozeTimes();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function handlePresetClick(value: string) {
    onSnooze(value);
  }

  function handleCustomSnooze() {
    if (customTime) {
      onSnooze(new Date(customTime).toISOString());
    }
  }

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-1 w-56 bg-[var(--surface-container-highest)] rounded-md shadow-lg border border-[var(--outline-variant)]/30 z-50 overflow-hidden"
    >
      <div className="p-2 space-y-1">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePresetClick(preset.value)}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-[var(--surface-bright)] transition-colors flex items-center gap-2 text-xs text-[var(--on-surface)]"
          >
            <Clock size={12} className="text-[var(--on-surface-variant)]" />
            {preset.label}
          </button>
        ))}
        
        <div className="border-t border-[var(--outline-variant)]/20 my-1" />

        {!showCustom ? (
          <button
            onClick={() => setShowCustom(true)}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-[var(--surface-bright)] transition-colors text-xs text-[var(--primary)]"
          >
            Custom time...
          </button>
        ) : (
          <div className="px-2 py-2 space-y-2">
            <input
              type="datetime-local"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md bg-[var(--surface-container)] text-[var(--on-surface)] text-xs border border-[var(--outline-variant)]/30 focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowCustom(false)}
                className="flex-1 px-2 py-1.5 text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
              >
                Cancel
              </button>
              <button
                onClick={handleCustomSnooze}
                disabled={!customTime}
                className="flex-1 px-2 py-1.5 rounded-md bg-[var(--primary)] text-[var(--on-primary)] text-xs disabled:opacity-50"
              >
                Set
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
