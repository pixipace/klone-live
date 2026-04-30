"use client";

import { useState, useCallback, useEffect, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

/**
 * Drop-in replacement for window.confirm — but matches the design system
 * and supports a destructive variant. Returns a hook that resolves a
 * promise on confirm/cancel, so existing callsites can stay terse:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm("Delete this post?", { destructive: true }))) return;
 */

type ConfirmOptions = {
  /** Modal title — required. The "are you sure?" question. */
  title: string;
  /** Optional 1-2 sentence body explaining the consequence. */
  description?: string;
  /** Confirm button label. Default "Continue." */
  confirmLabel?: string;
  /** Cancel button label. Default "Cancel." */
  cancelLabel?: string;
  /** Marks the action as destructive — confirm button turns red, an
   *  icon appears. Use for delete/remove/wipe operations. */
  destructive?: boolean;
};

type Resolver = (value: boolean) => void;

let openConfirmRef: ((opts: ConfirmOptions, resolve: Resolver) => void) | null = null;

/** Public API: returns a function that opens the modal and resolves
 *  a promise with true/false. Lazily mounts the modal portal. */
export function useConfirm() {
  return useCallback((titleOrOpts: string | ConfirmOptions, maybeOpts?: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      const opts: ConfirmOptions =
        typeof titleOrOpts === "string"
          ? { ...maybeOpts, title: titleOrOpts }
          : titleOrOpts;
      if (openConfirmRef) {
        openConfirmRef(opts, resolve);
      } else {
        // Provider not mounted — fall back to browser confirm so the
        // user still gets *some* dialog instead of a silent failure.
        resolve(window.confirm(opts.title));
      }
    });
  }, []);
}

/** Mount this once near the root of your tree (e.g. in DashboardShell).
 *  Holds the modal state and registers the singleton open function. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: Resolver;
  } | null>(null);

  useEffect(() => {
    openConfirmRef = (opts, resolve) => {
      setState({ opts, resolve });
    };
    return () => {
      openConfirmRef = null;
    };
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  // ESC closes (cancels). Tab focus stays trapped naturally inside the
  // modal because we mount it at the end of the DOM.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      {children}
      {state && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-scale"
        >
          {/* Backdrop — click cancels. Subtle blur for depth. */}
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
            onClick={() => close(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6">
            <div className="flex items-start gap-3">
              {state.opts.destructive && (
                <div className="w-9 h-9 shrink-0 rounded-md bg-error-soft flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-error" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2
                  id="confirm-title"
                  className="text-base font-semibold text-foreground tracking-tight"
                >
                  {state.opts.title}
                </h2>
                {state.opts.description && (
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {state.opts.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <Button variant="ghost" size="sm" onClick={() => close(false)}>
                {state.opts.cancelLabel || "Cancel"}
              </Button>
              <Button
                variant={state.opts.destructive ? "danger" : "primary"}
                size="sm"
                onClick={() => close(true)}
                autoFocus
              >
                {state.opts.confirmLabel || (state.opts.destructive ? "Delete" : "Continue")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
