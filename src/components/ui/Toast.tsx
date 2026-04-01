import { useEffect, useState } from "react";
import { X, AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { clsx } from "clsx";
import { useAppStatus } from "@/context/AppStatusContext";
import type { AppNotificationType } from "@/lib/types";

const ICONS: Record<AppNotificationType, React.ReactNode> = {
  warning: <AlertTriangle size={14} />,
  error: <XCircle size={14} />,
  info: <Info size={14} />,
  success: <CheckCircle2 size={14} />,
};

const STYLES: Record<AppNotificationType, string> = {
  warning: "bg-amber-950/90 text-amber-200 border-amber-700/50",
  error: "bg-red-950/90 text-red-200 border-red-700/50",
  info: "bg-[var(--surface-container-high)] text-[var(--on-surface)] border-[var(--outline-variant)]/40",
  success: "bg-emerald-950/90 text-emerald-200 border-emerald-700/50",
};

const ICON_STYLES: Record<AppNotificationType, string> = {
  warning: "text-amber-400",
  error: "text-red-400",
  info: "text-[var(--on-surface-variant)]",
  success: "text-emerald-400",
};

interface ToastItemProps {
  id: string;
  message: string;
  type: AppNotificationType;
  onDismiss: (id: string) => void;
}

function ToastItem({ id, message, type, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-in on mount
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={clsx(
        "flex items-start gap-2.5 px-3 py-2.5 rounded-lg border shadow-lg text-sm max-w-[320px] w-full",
        "transition-all duration-300 ease-out",
        visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0",
        STYLES[type],
      )}
    >
      <span className={clsx("mt-0.5 shrink-0", ICON_STYLES[type])}>{ICONS[type]}</span>
      <span className="flex-1 leading-snug">{message}</span>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useAppStatus();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem id={t.id} message={t.message} type={t.type} onDismiss={dismissToast} />
        </div>
      ))}
    </div>
  );
}
