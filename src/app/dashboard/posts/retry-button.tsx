"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Retry-failed-platforms control. Now shows the per-platform error
 * INLINE so users understand WHAT went wrong before they re-fire the
 * exact same request — many failures (token expired, account
 * permissions, file too large) won't be fixed by retrying alone.
 */
export function RetryButton({
  postId,
  failedPlatforms,
  failedDetails,
}: {
  postId: string;
  failedPlatforms: string[];
  /** Optional per-platform error messages — if omitted, only the
   *  platform names show on the retry button (back-compat). */
  failedDetails?: { platform: string; error: string }[];
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const retry = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Retry failed");
      toast.success(`Retrying ${failedPlatforms.join(", ")}`);
      startTransition(() => router.refresh());
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err).slice(0, 200);
      toast.error("Retry failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5 mt-2">
      {/* Per-platform error breakdown — compact pill list. Helps users
          decide if a retry will actually help (auth errors won't be
          fixed by retrying; transient network errors might). */}
      {failedDetails && failedDetails.length > 0 && (
        <ul className="space-y-0.5">
          {failedDetails.map((d) => (
            <li
              key={d.platform}
              className="flex items-start gap-1.5 text-[11px] text-error leading-tight"
            >
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                <span className="font-medium capitalize">{d.platform}:</span>{" "}
                <span className="text-foreground-secondary">{d.error}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={retry}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-accent-soft text-accent hover:bg-accent/15 disabled:opacity-50 transition-colors"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RotateCcw className="w-3 h-3" />
        )}
        Retry {failedPlatforms.join(", ")}
      </button>
    </div>
  );
}
