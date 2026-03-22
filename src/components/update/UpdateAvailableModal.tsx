"use client";

import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

interface UpdateAvailableModalProps {
  open: boolean;
  onClose: () => void;
  version: string;
  onConfirmDownload: () => void;
  confirmBusy: boolean;
}

export function UpdateAvailableModal({
  open,
  onClose,
  version,
  onConfirmDownload,
  confirmBusy,
}: UpdateAvailableModalProps) {
  return (
    <Dialog open={open} onClose={confirmBusy ? () => {} : onClose} title="Update available">
      <p className="text-sm text-[var(--on-surface-variant)] mb-4">
        Version <span className="text-[var(--on-surface)] font-medium tabular-nums">{version}</span> is available.
        Download and install now? The app will restart when the download finishes.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={confirmBusy}
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--surface-container-high)] text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)] disabled:opacity-50 transition-colors"
        >
          Not now
        </button>
        <button
          type="button"
          disabled={confirmBusy}
          onClick={onConfirmDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--primary)] text-[var(--on-primary)] hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {confirmBusy ? <Loader2 size={14} className="animate-spin" /> : null}
          Download and install
        </button>
      </div>
    </Dialog>
  );
}
