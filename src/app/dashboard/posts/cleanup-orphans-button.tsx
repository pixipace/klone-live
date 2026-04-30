"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

/**
 * One-click sweep of "orphan" posts — Post rows whose mediaUrl points
 * to a file that no longer exists on disk (almost always because the
 * underlying clip job was deleted). The schedule view shows these as
 * "Failed · Retry cancelled" rows with broken thumbnails. Worker
 * cleans them hourly; this button lets the user trigger it instantly.
 */
export function CleanupOrphansButton() {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const ok = await confirm({
      title: "Sweep orphan posts?",
      description: "Removes scheduled/failed posts whose source clip files no longer exist on disk. The worker does this hourly anyway — this just runs it now.",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts/cleanup-orphans", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const removed = data.removed ?? 0;
        if (removed === 0) {
          toast.info("Nothing to clean", "All posts have valid source files");
        } else {
          toast.success(`Removed ${removed} orphan post${removed === 1 ? "" : "s"}`);
        }
        router.refresh();
      } else {
        toast.error("Cleanup failed", data.error || "Please try again");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      title="Remove failed posts whose source clip files no longer exist"
      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-border hover:border-error/40 hover:text-error transition-colors disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Trash2 className="w-3 h-3" />
      )}
      Clean up orphans
    </button>
  );
}
