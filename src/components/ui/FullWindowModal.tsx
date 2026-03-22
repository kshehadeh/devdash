"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";

interface FullWindowModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional; wired to `aria-describedby` when set */
  description?: string;
  children: React.ReactNode;
}

export function FullWindowModal({ open, onClose, title, description, children }: FullWindowModalProps) {
  const titleId = useId();
  const descriptionId = useId();

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
      className="fixed inset-0 z-50 flex flex-col min-h-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div className="absolute inset-0 bg-[var(--surface-container-lowest)]/70 backdrop-blur-sm" aria-hidden />

      <div className="relative z-10 flex flex-col flex-1 min-h-0 w-full bg-[var(--surface-container-highest)]/95 backdrop-blur-xl shadow-2xl border-t border-[var(--outline-variant)]/20">
        <header className="flex shrink-0 items-start justify-between gap-4 px-6 py-4 border-b border-[var(--outline-variant)]/20">
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="text-lg font-semibold text-[var(--on-surface)]">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-[var(--on-surface-variant)]">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-container-highest)] transition-colors"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
