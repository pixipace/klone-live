"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Flame, Clock, Send, Sparkles, Check, Pencil, Save, X, RotateCcw, Zap, Loader2 } from "lucide-react";

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
};

export type JobDetail = {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  clips: ClipDetail[];
};

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
}: {
  jobId: string;
  clip: ClipDetail;
  onUpdate: (newTitle: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (clip.hookVariants.length <= 1) return null;

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

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-accent hover:text-accent/80 inline-flex items-center gap-1"
      >
        <Sparkles className="w-3 h-3" />
        {open ? "Hide variants" : `Try ${clip.hookVariants.length - 1} other hook${clip.hookVariants.length > 2 ? "s" : ""}`}
      </button>
      {open && (
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
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ scheduled: number; firstAt: string; lastAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <div className="flex flex-col gap-2 justify-center">
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

      {job.clips.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No clips were picked from this source.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {job.clips.map((clip, i) => (
            <Card key={clip.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Clip {i + 1}
                </span>
                <div className="flex items-center gap-1">
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
                clip={{ ...clip, hookTitle: titles[clip.id] ?? clip.hookTitle }}
                onUpdate={(newTitle) =>
                  setTitles((prev) => ({ ...prev, [clip.id]: newTitle }))
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
              <div className="flex gap-2">
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
                  </>
                ) : (
                  <Badge variant="default">Video processing…</Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
