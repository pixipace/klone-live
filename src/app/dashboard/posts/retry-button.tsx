"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";

export function RetryButton({
  postId,
  failedPlatforms,
}: {
  postId: string;
  failedPlatforms: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Retry failed");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err).slice(0, 100));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        onClick={retry}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RotateCcw className="w-3 h-3" />
        )}
        Retry {failedPlatforms.join(", ")}
      </button>
      {error && <span className="text-[11px] text-error">{error}</span>}
    </div>
  );
}
