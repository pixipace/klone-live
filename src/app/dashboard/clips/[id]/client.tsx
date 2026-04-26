"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Flame, Clock, Send, Sparkles, Check, Pencil, Save, X, RotateCcw, Zap, Loader2, RefreshCcw, Scissors, Film } from "lucide-react";
import { ShareButton } from "./share-button";

export type ClipDetail = {
  id: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  hookTitle: string;
  hookVariants: string[];
  reason: string | null;
  viralityScore: number;
  transcript: string | null;
  videoPath: string | null;
  thumbnailPath: string | null;
  musicAttribution: string | null;
  publicShareEnabled: boolean;
  /** Per-platform post status — live = published, scheduled = queued,
   *  failed = errored. Lets the user see at a glance what's posted vs
   *  pending without leaving the clip detail page. */
  postStatus: {
    live: string[];
    scheduled: string[];
    failed: string[];
  };
};

export type JobDetail = {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  highlightReelPath: string | null;
  highlightReelThumb: string | null;
  highlightReelHook: string | null;
  clips: ClipDetail[];
};

/**
 * Compact pill showing where a clip already lives vs what's still pending.
 * Three buckets: live (POSTED/PARTIAL), scheduled (SCHEDULED/POSTING),
 * failed. Renders the highest-priority state visibly + the others as a
 * subtle hover/tooltip-friendly dot strip.
 */
function ClipPostStatus({
  status,
}: {
  status: { live: string[]; scheduled: string[]; failed: string[] };
}) {
  const liveCount = status.live.length;
  const schedCount = status.scheduled.length;
  const failedCount = status.failed.length;

  if (liveCount === 0 && schedCount === 0 && failedCount === 0) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border/40 text-muted">
        Not posted
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {liveCount > 0 && (
        <span
          title={`Live on: ${status.live.join(", ")}`}
          className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-medium inline-flex items-center gap-1"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          Live · {status.live.join(", ")}
        </span>
      )}
      {schedCount > 0 && (
        <span
          title={`Scheduled for: ${status.scheduled.join(", ")}`}
          className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium inline-flex items-center gap-1"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          Scheduled · {status.scheduled.join(", ")}
        </span>
      )}
      {failedCount > 0 && (
        <span
          title={`Failed on: ${status.failed.join(", ")}`}
          className="text-[10px] px-1.5 py-0.5 rounded bg-error/15 text-error font-medium inline-flex items-center gap-1"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-error" />
          Failed · {status.failed.join(", ")}
        </span>
      )}
    </div>
  );
}

function TrimDialog({
  jobId,
  clip,
  onClose,
  onTrimmed,
}: {
  jobId: string;
  clip: ClipDetail;
  onClose: () => void;
  onTrimmed: (newDuration: number) => void;
}) {
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newDur = Math.max(0, clip.durationSec - trimStart - trimEnd);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clips/${jobId}/clip/${clip.id}/trim`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trimStartSec: trimStart,
            trimEndSec: trimEnd,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Trim failed");
        return;
      }
      onTrimmed(data.newDuration);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 p-4 rounded-lg border border-accent/40 bg-accent/5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          Trim clip · current {clip.durationSec.toFixed(1)}s
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">
            Trim from start (s)
          </label>
          <input
            type="number"
            min={0}
            max={Math.max(0, clip.durationSec - 5)}
            step={0.5}
            value={trimStart}
            onChange={(e) => setTrimStart(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">
            Trim from end (s)
          </label>
          <input
            type="number"
            min={0}
            max={Math.max(0, clip.durationSec - 5)}
            step={0.5}
            value={trimEnd}
            onChange={(e) => setTrimEnd(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        New duration: <strong className="text-foreground">{newDur.toFixed(1)}s</strong>{" "}
        (must be ≥ 5s). Trim is destructive — the original clip file is replaced.
      </p>
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={busy || newDur < 5 || (trimStart === 0 && trimEnd === 0)}
        >
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              Trimming…
            </>
          ) : (
            <>
              <Scissors className="w-3.5 h-3.5 mr-1" />
              Apply trim
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function HighlightReelPanel({
  jobId,
  clipCount,
  initialReel,
}: {
  jobId: string;
  clipCount: number;
  initialReel: {
    path: string | null;
    thumb: string | null;
    hook: string | null;
  };
}) {
  const [reel, setReel] = useState(initialReel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (clipCount < 2) return null;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clips/${jobId}/highlight-reel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDurationSec: 90 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate");
        return;
      }
      setReel({
        path: data.reelPath,
        thumb: `/api/uploads/clips/${jobId}/highlight-reel.jpg`,
        hook: reel.hook,
      });
    } finally {
      setBusy(false);
    }
  };

  if (reel.path) {
    return (
      <Card className="p-5 border-accent/30 bg-gradient-to-br from-accent/5 to-card">
        <div className="flex items-center gap-2 mb-3">
          <Film className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Highlight reel</h3>
          <span className="text-[10px] text-muted-foreground">
            top clips compiled with crossfades
          </span>
        </div>
        <video
          src={reel.path}
          poster={reel.thumb ?? undefined}
          controls
          preload="metadata"
          className="w-full rounded-lg bg-black aspect-[9/16] max-h-[600px] mx-auto"
        />
        {reel.hook && (
          <p className="text-xs text-muted-foreground mt-2 text-center italic">
            &ldquo;{reel.hook}&rdquo;
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <a
            href={reel.path}
            download="highlight-reel.mp4"
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 font-medium rounded-lg border border-border hover:border-accent/30 transition-colors"
          >
            Download reel
          </a>
          <Button size="sm" onClick={generate} disabled={busy} variant="outline">
            <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Re-generating…" : "Regenerate"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-accent/30 bg-gradient-to-br from-accent/5 to-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Highlight reel</h3>
        </div>
        <Button size="sm" onClick={generate} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Make highlight reel
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Auto-compiles your highest-scoring clips into one ~90s reel with smooth
        crossfades. Great for a single big-impact post.
      </p>
      {error && <p className="text-xs text-error mt-2">{error}</p>}
    </Card>
  );
}

function HookEditor({
  jobId,
  clipId,
  value,
  onChange,
}: {
  jobId: string;
  clipId: string;
  value: string;
  onChange: (newValue: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clips/${jobId}/clip/${clipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hookTitle: trimmed }),
      });
      if (res.ok) {
        onChange(trimmed);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="group text-left w-full"
      >
        <h3 className="text-base font-semibold leading-snug inline">{value}</h3>
        <Pencil className="inline-block w-3 h-3 ml-2 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        autoFocus
        className="w-full bg-background border border-accent rounded-lg px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded text-muted-foreground hover:text-foreground"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

function HookPicker({
  jobId,
  clip,
  onUpdate,
  onVariantsRefresh,
}: {
  jobId: string;
  clip: ClipDetail;
  onUpdate: (newTitle: string) => void;
  onVariantsRefresh: (newVariants: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const choose = async (title: string) => {
    if (title === clip.hookTitle) {
      setOpen(false);
      return;
    }
    setBusy(title);
    try {
      const res = await fetch(`/api/clips/${jobId}/clip/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hookTitle: title }),
      });
      if (res.ok) {
        onUpdate(title);
        setOpen(false);
      }
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(
        `/api/clips/${jobId}/clip/${clip.id}/regenerate-hook`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setRegenError(data.error || "Failed to regenerate");
        return;
      }
      onVariantsRefresh(data.variants as string[]);
      setOpen(true);
    } finally {
      setRegenerating(false);
    }
  };

  const hasVariants = clip.hookVariants.length > 1;

  return (
    <div>
      <div className="flex items-center gap-3">
        {hasVariants && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-[11px] text-accent hover:text-accent/80 inline-flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            {open ? "Hide variants" : `Try ${clip.hookVariants.length - 1} other hook${clip.hookVariants.length > 2 ? "s" : ""}`}
          </button>
        )}
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="text-[11px] text-muted-foreground hover:text-accent inline-flex items-center gap-1 disabled:opacity-60"
        >
          <RefreshCcw className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} />
          {regenerating ? "Generating…" : "Regenerate hooks"}
        </button>
      </div>
      {regenError && (
        <p className="text-[11px] text-error mt-1">{regenError}</p>
      )}
      {open && hasVariants && (
        <div className="mt-2 space-y-1.5">
          {clip.hookVariants.map((v, i) => {
            const isCurrent = v === clip.hookTitle;
            return (
              <button
                key={i}
                onClick={() => choose(v)}
                disabled={busy === v}
                className={`w-full text-left text-xs px-2 py-1.5 rounded border transition-colors ${
                  isCurrent
                    ? "border-accent bg-accent/5 text-foreground"
                    : "border-border bg-background hover:border-accent/30"
                } ${busy === v ? "opacity-50" : ""}`}
              >
                <div className="flex items-start gap-1.5">
                  {isCurrent && <Check className="w-3 h-3 text-accent flex-shrink-0 mt-0.5" />}
                  <span>{v}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", color: "#0077b5" },
  { id: "instagram", name: "Instagram", color: "#e4405f" },
  { id: "facebook", name: "Facebook", color: "#1877f2" },
  { id: "tiktok", name: "TikTok", color: "#00f2ea" },
  { id: "youtube", name: "YouTube", color: "#ff0000" },
] as const;

function AutoDistributePanel({
  jobId,
  clipCount,
}: {
  jobId: string;
  clipCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(["linkedin"])
  );
  const [clipsPerDay, setClipsPerDay] = useState(1);
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [withAi, setWithAi] = useState(true);
  const [timezone, setTimezone] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    }
    return "UTC";
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ scheduled: number; firstAt: string; lastAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from saved publishing preferences (set on /dashboard/clips
  // first screen). Falls back to defaults if user hasn't saved any.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/clipper-prefs")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.platforms) && d.platforms.length > 0) {
          setSelectedPlatforms(new Set(d.platforms));
        }
        if (typeof d.clipsPerDay === "number") setClipsPerDay(d.clipsPerDay);
        if (typeof d.skipWeekends === "boolean") setSkipWeekends(d.skipWeekends);
        if (typeof d.withAiHashtags === "boolean") setWithAi(d.withAiHashtags);
        if (typeof d.timezone === "string" && d.timezone) setTimezone(d.timezone);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/clips/${jobId}/auto-distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: Array.from(selectedPlatforms),
          clipsPerDay,
          skipWeekends,
          withAiHashtags: withAi,
          timezone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Distribute failed");
        return;
      }
      setResult({
        scheduled: data.scheduled,
        firstAt: data.firstAt,
        lastAt: data.lastAt,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (clipCount === 0) return null;

  if (result) {
    return (
      <Card className="p-5 border-success/30 bg-success/5">
        <div className="flex items-center gap-2 mb-2">
          <Check className="w-4 h-4 text-success" />
          <h3 className="text-sm font-semibold text-success">
            Scheduled {result.scheduled} posts
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          First post: {new Date(result.firstAt).toLocaleString()} · Last post:{" "}
          {new Date(result.lastAt).toLocaleString()}
        </p>
        <Link
          href="/dashboard/posts?filter=scheduled"
          className="inline-block mt-3 text-xs text-accent hover:underline"
        >
          View scheduled posts →
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-accent/30 bg-gradient-to-br from-accent/5 to-card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Auto-distribute clips</h3>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-accent hover:underline"
        >
          {open ? "Hide" : "Set up →"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Skip the manual posting. Klone schedules each clip across your selected
        platforms at the best times for each one.
      </p>

      {open && (
        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Post to
            </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const active = selectedPlatforms.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                      active
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded text-white text-[8px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name[0]}
                    </div>
                    {p.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted mt-2">
              You must have these accounts connected.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Clips per day
              </label>
              <select
                value={clipsPerDay}
                onChange={(e) => setClipsPerDay(parseInt(e.target.value, 10))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} clip{n === 1 ? "" : "s"} per day
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Audience timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value={timezone}>{timezone} (your timezone)</option>
                <option value="America/New_York">US East (NYC)</option>
                <option value="America/Los_Angeles">US West (LA)</option>
                <option value="America/Chicago">US Central (Chicago)</option>
                <option value="Europe/London">UK / Ireland</option>
                <option value="Europe/Paris">Europe Central</option>
                <option value="Asia/Karachi">Pakistan</option>
                <option value="Asia/Kolkata">India</option>
                <option value="Asia/Dubai">UAE / Gulf</option>
                <option value="Asia/Singapore">Singapore / SE Asia</option>
                <option value="Australia/Sydney">Sydney / AU East</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={skipWeekends}
                onChange={(e) => setSkipWeekends(e.target.checked)}
                className="accent-accent"
              />
              Skip weekends
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={withAi}
                onChange={(e) => setWithAi(e.target.checked)}
                className="accent-accent"
              />
              AI-generated hashtags per platform
            </label>
          </div>

          <div className="rounded-lg bg-card/40 border border-border/40 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">{clipCount}</strong> clip
            {clipCount === 1 ? "" : "s"} ×{" "}
            <strong className="text-foreground">
              {selectedPlatforms.size || "?"}
            </strong>{" "}
            platform{selectedPlatforms.size === 1 ? "" : "s"} ={" "}
            <strong className="text-foreground">
              {clipCount * selectedPlatforms.size}
            </strong>{" "}
            posts across{" "}
            <strong className="text-foreground">
              ~{Math.ceil(clipCount / clipsPerDay)}
            </strong>{" "}
            day{Math.ceil(clipCount / clipsPerDay) === 1 ? "" : "s"}
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || selectedPlatforms.size === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Scheduling…
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 mr-2" />
                Schedule {clipCount * selectedPlatforms.size} posts
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}

export function ClipDetailClient({ job }: { job: JobDetail }) {
  const router = useRouter();
  const [titles, setTitles] = useState<Record<string, string>>(() =>
    Object.fromEntries(job.clips.map((c) => [c.id, c.hookTitle]))
  );
  const [variants, setVariants] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(job.clips.map((c) => [c.id, c.hookVariants]))
  );
  const [durations, setDurations] = useState<Record<string, number>>(() =>
    Object.fromEntries(job.clips.map((c) => [c.id, c.durationSec]))
  );
  const [trimmingClipId, setTrimmingClipId] = useState<string | null>(null);
  const [repicking, setRepicking] = useState(false);
  const [repickErr, setRepickErr] = useState<string | null>(null);

  const repick = async () => {
    if (!confirm("Re-pick clips? Current clips will be deleted and Gemma will pick new moments.")) return;
    setRepicking(true);
    setRepickErr(null);
    try {
      const res = await fetch(`/api/clips/${job.id}/repick`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Re-pick failed");
      router.push("/dashboard/clips");
    } catch (err) {
      setRepickErr(String(err instanceof Error ? err.message : err));
    } finally {
      setRepicking(false);
    }
  };

  const sendToCompose = (clip: ClipDetail) => {
    if (!clip.videoPath) return;
    const baseCaption = titles[clip.id] ?? clip.hookTitle;
    const caption = clip.musicAttribution
      ? `${baseCaption}\n\n${clip.musicAttribution}`
      : baseCaption;
    const payload = {
      caption,
      mediaUrl: clip.videoPath,
      mediaType: "video" as const,
      mediaName: `Clip from ${job.sourceTitle || "source"}`,
      clipId: clip.id,
      ts: Date.now(),
    };
    sessionStorage.setItem("klone:compose-prefill", JSON.stringify(payload));
    router.push("/dashboard/create");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Link
            href="/dashboard/clips"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Clip Studio
          </Link>
          <h1 className="text-2xl font-semibold">
            {job.sourceTitle || "Untitled"}
          </h1>
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-accent inline-flex items-center gap-1 mt-1"
          >
            {job.sourceUrl}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={repick}
          disabled={repicking}
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          {repicking ? "Re-picking…" : "Re-pick clips"}
        </Button>
      </div>
      {repickErr && (
        <p className="text-xs text-error">{repickErr}</p>
      )}

      <AutoDistributePanel
        jobId={job.id}
        clipCount={job.clips.filter((c) => c.videoPath).length}
      />

      <HighlightReelPanel
        jobId={job.id}
        clipCount={job.clips.filter((c) => c.videoPath).length}
        initialReel={{
          path: job.highlightReelPath,
          thumb: job.highlightReelThumb,
          hook: job.highlightReelHook,
        }}
      />

      {job.clips.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No clips were picked from this source.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {job.clips.map((clip, i) => (
            <Card key={clip.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Clip {i + 1}
                  </span>
                  <ClipPostStatus status={clip.postStatus} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Flame
                    className={`w-3.5 h-3.5 ${clip.viralityScore >= 8 ? "text-warning" : "text-muted"}`}
                  />
                  <span className="text-xs font-medium">
                    {clip.viralityScore}/10
                  </span>
                </div>
              </div>

              {clip.videoPath ? (
                <video
                  src={clip.videoPath}
                  poster={clip.thumbnailPath ?? undefined}
                  controls
                  preload="metadata"
                  className="w-full rounded-lg bg-black aspect-[9/16] max-h-[480px] mx-auto"
                />
              ) : clip.thumbnailPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clip.thumbnailPath}
                  alt=""
                  className="w-full rounded-lg object-cover aspect-[9/16] max-h-[480px] mx-auto"
                />
              ) : (
                <div className="w-full rounded-lg bg-card border border-border aspect-[9/16] max-h-[480px] flex items-center justify-center text-xs text-muted-foreground">
                  Cutting…
                </div>
              )}

              <HookEditor
                jobId={job.id}
                clipId={clip.id}
                value={titles[clip.id] ?? clip.hookTitle}
                onChange={(newTitle) =>
                  setTitles((prev) => ({ ...prev, [clip.id]: newTitle }))
                }
              />
              <HookPicker
                jobId={job.id}
                clip={{
                  ...clip,
                  hookTitle: titles[clip.id] ?? clip.hookTitle,
                  hookVariants: variants[clip.id] ?? clip.hookVariants,
                }}
                onUpdate={(newTitle) =>
                  setTitles((prev) => ({ ...prev, [clip.id]: newTitle }))
                }
                onVariantsRefresh={(newVariants) =>
                  setVariants((prev) => ({ ...prev, [clip.id]: newVariants }))
                }
              />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(clip.startSec)} – {formatTime(clip.endSec)}
                </span>
                <span>· {Math.round(clip.durationSec)}s</span>
              </div>
              {clip.reason && (
                <p className="text-xs text-muted-foreground italic">
                  {clip.reason}
                </p>
              )}
              {clip.musicAttribution && (
                <p className="text-[11px] text-accent">
                  {clip.musicAttribution} — auto-added to caption on Send
                </p>
              )}
              {clip.transcript && (
                <p className="text-xs text-foreground/80 line-clamp-3">
                  &ldquo;{clip.transcript.slice(0, 280)}
                  {clip.transcript.length > 280 ? "…" : ""}&rdquo;
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {clip.videoPath ? (
                  <>
                    <a
                      href={clip.videoPath}
                      download={`${clip.hookTitle.slice(0, 40).replace(/[^\w\s-]/g, "")}.mp4`}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 font-medium rounded-lg border border-border hover:border-accent/30 transition-colors"
                    >
                      Download
                    </a>
                    <Button size="sm" onClick={() => sendToCompose(clip)}>
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Send to Compose
                    </Button>
                    <button
                      onClick={() =>
                        setTrimmingClipId(trimmingClipId === clip.id ? null : clip.id)
                      }
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 font-medium rounded-lg border border-border hover:border-accent/30 transition-colors"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      Trim
                    </button>
                    <ShareButton
                      jobId={job.id}
                      clipId={clip.id}
                      initialEnabled={clip.publicShareEnabled}
                    />
                  </>
                ) : (
                  <Badge variant="default">Video processing…</Badge>
                )}
              </div>
              {trimmingClipId === clip.id && (
                <TrimDialog
                  jobId={job.id}
                  clip={{
                    ...clip,
                    durationSec: durations[clip.id] ?? clip.durationSec,
                  }}
                  onClose={() => setTrimmingClipId(null)}
                  onTrimmed={(newDur) =>
                    setDurations((prev) => ({ ...prev, [clip.id]: newDur }))
                  }
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
