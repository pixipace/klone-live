"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";

export function CancelScheduledButton({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const cancel = async () => {
    if (
      !confirm(
        `Cancel all ${count} scheduled post${count === 1 ? "" : "s"}? They won't go out — but you can re-schedule them later.`
      )
    )
      return;
    setBusy(true);
    try {
      await fetch("/api/posts/cancel-scheduled", { method: "POST" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={cancel}
      disabled={busy}
      className="ml-auto inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-error/30 text-error hover:bg-error/10 disabled:opacity-50 transition-colors"
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <X className="w-3 h-3" />
      )}
      Cancel all scheduled
    </button>
  );
}
