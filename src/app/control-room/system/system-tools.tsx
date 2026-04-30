"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, ScrollText, RefreshCcw } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

const CACHE_TARGETS = [
  { id: "source", label: "YouTube source cache (.uploads/source-cache)" },
  { id: "broll", label: "B-roll image cache (.uploads/broll-cache)" },
  { id: "clipper-work", label: "Clipper work dir (/tmp/klone-clipper)" },
  { id: "all", label: "All of the above" },
] as const;

export function CacheControls() {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const clear = async (target: string) => {
    const ok = await confirm({
      title: `Clear ${target} cache?`,
      description: target === "all"
        ? "Wipes source video cache, B-roll image cache, and the clipper work directory. Source caches rebuild on next download (slower first job)."
        : "Source caches rebuild on next download. No clip data is lost.",
      destructive: true,
      confirmLabel: "Clear cache",
    });
    if (!ok) return;
    setBusy(target);
    setResult(null);
    try {
      const res = await fetch("/api/control-room/cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Cache clear failed", data.error);
      } else {
        toast.success(`Cleared ${target} cache`);
      }
      setResult(data.results || { error: data.error });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {CACHE_TARGETS.map((t) => (
          <button
            key={t.id}
            onClick={() => clear(t.id)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-card border border-border hover:border-error/30 hover:text-error disabled:opacity-50 transition-colors"
            title={t.label}
          >
            {busy === t.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Clear {t.id}
          </button>
        ))}
      </div>
      {result && (
        <pre className="mt-2 p-3 rounded-lg bg-card border border-border/40 text-[10px] text-muted-foreground overflow-x-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function LogTail() {
  const [source, setSource] = useState<"stdout" | "stderr">("stdout");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/control-room/logs?source=${source}&lines=200`);
      const t = await res.text();
      setText(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (!auto) return;
    const t = setInterval(fetchLogs, 5_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, auto]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 p-0.5 rounded-lg bg-card border border-border w-fit">
          <button
            onClick={() => setSource("stdout")}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${source === "stdout" ? "bg-accent text-white" : "text-muted-foreground"}`}
          >
            stdout
          </button>
          <button
            onClick={() => setSource("stderr")}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${source === "stderr" ? "bg-error text-white" : "text-muted-foreground"}`}
          >
            stderr
          </button>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="text-xs px-2 py-1 rounded bg-card border border-border inline-flex items-center gap-1"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCcw className="w-3 h-3" />
          )}
          Refresh
        </button>
        <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="accent-accent"
          />
          Auto-refresh (5s)
        </label>
      </div>
      <pre className="p-3 rounded-lg bg-black/40 border border-border/40 text-[10px] text-muted-foreground overflow-auto max-h-[420px] whitespace-pre-wrap">
        {text || "(empty)"}
      </pre>
    </div>
  );
}

export function SystemToolsHeader() {
  return (
    <div className="flex items-center gap-2 mb-3">
      <ScrollText className="w-4 h-4 text-accent" />
      <h2 className="text-sm font-semibold">Power tools</h2>
    </div>
  );
}
