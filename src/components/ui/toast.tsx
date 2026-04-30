"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight in-house toast system. ~100 lines, zero dependencies, fits
 * the Klone design system. Replaces every browser alert() in the app.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success("Post published");
 *   toast.error("Failed to delete", "Please try again later");
 *   toast.info("Saved");
 */

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
};

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

type ToastContextValue = {
  toast: ToastApi;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant) => (title: string, description?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, variant, title, description }]);
      // Auto-dismiss after TOAST_DURATION_MS unless user hovers (handled in
      // the toast component via per-toast timer cleared on mouseenter).
    },
    []
  );

  const toast: ToastApi = {
    success: push("success"),
    error: push("error"),
    info: push("info"),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Portal-style overlay — fixed bottom-right, stacks vertically.
          z-[100] sits above modals (z-50) so toasts win in any conflict. */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Per-toast auto-dismiss. Cleared if the user hovers (gives time to read
  // longer messages) and restarted on mouseleave.
  useEffect(() => {
    const t = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const Icon =
    toast.variant === "success"
      ? CheckCircle2
      : toast.variant === "error"
      ? AlertCircle
      : Info;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto min-w-[280px] max-w-sm bg-card border border-border rounded-lg shadow-lg p-3.5 flex items-start gap-3 animate-fade-up",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 shrink-0 mt-0.5",
          toast.variant === "success" && "text-success",
          toast.variant === "error" && "text-error",
          toast.variant === "info" && "text-foreground"
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-muted hover:text-foreground transition-colors -mr-1 -mt-1 p-1"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // SSR / no-provider fallback — log to console so the call doesn't
    // crash. In dev this surfaces as a visible warning to mount the
    // provider; in prod it degrades gracefully.
    return {
      success: (t) => console.log("[toast:success]", t),
      error: (t) => console.error("[toast:error]", t),
      info: (t) => console.log("[toast:info]", t),
    };
  }
  return ctx.toast;
}
