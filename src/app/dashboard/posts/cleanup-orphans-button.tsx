"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

/**
 * One-click sweep of "orphan" posts — Post rows whose mediaUrl points
 * to a file that no longer exists on disk (almost always because the
 * underlying clip job was deleted). The schedule view shows these as
 * "Failed · Retry cancelled" rows with broken thumbnails. Worker
 * cleans them hourly; this button lets the user trigger it instantly.
 */
export function CleanupOrphansButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ removed: number } | null>(null);

  const run = async () => {
    if (!confirm("Sweep posts whose source clip files were deleted?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts/cleanup-orphans", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setDone({ removed: data.removed ?? 0 });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        title="Remove failed posts whose source clip files no longer exist"
        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border border-border hover:border-error/40 hover:text-error transition-colors disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Trash2 className="w-3 h-3" />
        )}
        Clean up orphans
      </button>
      {done && (
        <span className="text-[10px] text-muted-foreground">
          Removed {done.removed} orphan{done.removed === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
