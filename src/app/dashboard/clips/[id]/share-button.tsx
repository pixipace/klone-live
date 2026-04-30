"use client";

import { useState } from "react";
import { Globe, Lock, Loader2, Copy, Check, ExternalLink } from "lucide-react";

export function ShareButton({
  jobId,
  clipId,
  initialEnabled,
}: {
  jobId: string;
  clipId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = enabled
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/c/${clipId}`
    : null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clips/${jobId}/clip/${clipId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      setEnabled(data.enabled);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail on insecure contexts — fall back silently
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        onClick={toggle}
        disabled={busy}
        title={
          enabled
            ? "This clip is publicly viewable. Click to make private."
            : "Make this clip publicly viewable at klone.live/c/<id>"
        }
        className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 font-medium rounded-lg border transition-colors ${
          enabled
            ? "border-success/30 bg-success/10 text-success hover:bg-success/15"
            : "border-border bg-card hover:border-accent/30"
        } disabled:opacity-50`}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : enabled ? (
          <Globe className="w-3.5 h-3.5" />
        ) : (
          <Lock className="w-3.5 h-3.5" />
        )}
        {enabled ? "Public" : "Make public"}
      </button>
      {enabled && shareUrl && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check className="w-3 h-3 text-success" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-accent"
          >
            Open <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      )}
      {error && <p className="text-[10px] text-error">{error}</p>}
    </div>
  );
}
