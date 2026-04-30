"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function CancelScheduledButton({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  const cancel = async () => {
    const ok = await confirm({
      title: `Cancel ${count} scheduled post${count === 1 ? "" : "s"}?`,
      description: "They won't go out at their scheduled times. You can re-schedule them later from each clip.",
      destructive: true,
      confirmLabel: "Cancel posts",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch("/api/posts/cancel-scheduled", { method: "POST" });
      toast.success(`${count} post${count === 1 ? "" : "s"} cancelled`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={cancel}
      disabled={busy}
      className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-error/30 text-error hover:bg-error-soft disabled:opacity-50 transition-colors"
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
