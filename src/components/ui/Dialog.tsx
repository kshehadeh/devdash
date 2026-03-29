"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--surface-container-lowest)]/70 backdrop-blur-sm" />

      {/* Panel — max height + scrollable body so long forms (e.g. data sources) stay usable */}
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-[var(--surface-container-highest)]/90 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--outline-variant)]/20 px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--on-surface)]">{title}</h2>
          <button
            onClick={onClose}
            className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
