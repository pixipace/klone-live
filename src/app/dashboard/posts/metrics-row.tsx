"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCcw,
  Loader2,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type PlatformMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  fetchedAt?: string;
};

export function MetricsRow({
  postId,
  metrics,
  metricsUpdatedAt,
  hasFetchablePlatforms,
}: {
  postId: string;
  metrics: Record<string, PlatformMetrics>;
  metricsUpdatedAt: string | null;
  /** True if at least one connected platform supports metrics fetch
   *  (currently youtube + instagram). Hides the refresh button otherwise. */
  hasFetchablePlatforms: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/refresh-metrics`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err).slice(0, 100));
    } finally {
      setBusy(false);
    }
  };

  const entries = Object.entries(metrics).filter(
    ([, m]) =>
      typeof m.views === "number" ||
      typeof m.likes === "number" ||
      typeof m.comments === "number"
  );

  if (!hasFetchablePlatforms) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      {entries.length === 0 ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted">
            No metrics yet — refresh to pull from platforms
          </span>
          <button
            onClick={refresh}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-card border border-border hover:border-accent/30 transition-colors disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCcw className="w-3 h-3" />
            )}
            Refresh
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] text-muted uppercase tracking-wider inline-flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Performance
            </span>
            <button
              onClick={refresh}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={
                metricsUpdatedAt
                  ? `Updated ${formatDistanceToNow(new Date(metricsUpdatedAt), { addSuffix: true })}`
                  : ""
              }
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCcw className="w-3 h-3" />
              )}
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="space-y-1.5">
            {entries.map(([platform, m]) => (
              <div
                key={platform}
                className="flex items-center gap-3 text-[11px]"
              >
                <span className="text-muted-foreground capitalize w-16 shrink-0">
                  {platform}
                </span>
                <div className="flex items-center gap-3 flex-wrap text-muted-foreground">
                  {typeof m.views === "number" && (
                    <span className="inline-flex items-center gap-0.5">
                      <Eye className="w-3 h-3" />
                      {formatN(m.views)}
                    </span>
                  )}
                  {typeof m.likes === "number" && (
                    <span className="inline-flex items-center gap-0.5">
                      <Heart className="w-3 h-3" />
                      {formatN(m.likes)}
                    </span>
                  )}
                  {typeof m.comments === "number" && (
                    <span className="inline-flex items-center gap-0.5">
                      <MessageCircle className="w-3 h-3" />
                      {formatN(m.comments)}
                    </span>
                  )}
                  {typeof m.shares === "number" && (
                    <span className="inline-flex items-center gap-0.5">
                      <Share2 className="w-3 h-3" />
                      {formatN(m.shares)}
                    </span>
                  )}
                  {typeof m.saves === "number" && (
                    <span className="inline-flex items-center gap-0.5">
                      <Bookmark className="w-3 h-3" />
                      {formatN(m.saves)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {error && <p className="text-[11px] text-error mt-1">{error}</p>}
    </div>
  );
}

function formatN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
