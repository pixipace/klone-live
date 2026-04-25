"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Scissors,
  Loader2,
  Sparkles,
  ExternalLink,
  Trash2,
  Clock,
  Video,
  Send,
  Check,
  Save,
} from "lucide-react";

const PUBLISH_PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", color: "#0077b5" },
  { id: "instagram", name: "Instagram", color: "#e4405f" },
  { id: "facebook", name: "Facebook", color: "#1877f2" },
  { id: "tiktok", name: "TikTok", color: "#00f2ea" },
  { id: "youtube", name: "YouTube", color: "#ff0000" },
] as const;

const TIMEZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

type PublishPrefs = {
  autoPublish: boolean;
  platforms: string[];
  clipsPerDay: number;
  skipWeekends: boolean;
  withAiHashtags: boolean;
  timezone: string | null;
};

type ClipJob = {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceDuration: number | null;
  status: string;
  stage: string | null;
  stageDetail: string | null;
  progress: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  _count: { clips: number };
};

const STAGE_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  DOWNLOADING: "Downloading…",
  TRANSCRIBING: "Transcribing audio…",
  PICKING: "AI picking viral moments…",
  CUTTING: "Cutting clips…",
  DONE: "Done",
  FAILED: "Failed",
};

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "error" | "default" | "accent"
> = {
  QUEUED: "default",
  RUNNING: "accent",
  DONE: "success",
  FAILED: "error",
};

export default function ClipsPage() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ClipJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [optCaptions, setOptCaptions] = useState(true);
  const [optMusic, setOptMusic] = useState(true);
  const [optPunch, setOptPunch] = useState(true);
  const [optBroll, setOptBroll] = useState(false);
  const [optTranslate, setOptTranslate] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [prefs, setPrefs] = useState<PublishPrefs | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSavedAt, setPrefsSavedAt] = useState<number | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/clips");
      const data = await res.json();
      if (res.ok) setJobs(data.jobs || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/user/clipper-prefs");
      const data = await res.json();
      if (res.ok) {
        setPrefs({
          autoPublish: !!data.autoPublish,
          platforms: Array.isArray(data.platforms) ? data.platforms : [],
          clipsPerDay: typeof data.clipsPerDay === "number" ? data.clipsPerDay : 1,
          skipWeekends: data.skipWeekends !== false,
          withAiHashtags: data.withAiHashtags !== false,
          timezone:
            data.timezone ||
            (typeof window !== "undefined"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : null),
        });
      }
    } catch {
      // non-fatal — prefs UI just won't render
    }
  }, []);

  const savePrefs = async () => {
    if (!prefs) return;
    setPrefsSaving(true);
    setPrefsError(null);
    try {
      const res = await fetch("/api/user/clipper-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (!res.ok) {
        setPrefsError(data.error || "Failed to save");
      } else {
        setPrefsSavedAt(Date.now());
      }
    } finally {
      setPrefsSaving(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchPrefs();
    const t = setInterval(fetchJobs, 5000);
    return () => clearInterval(t);
  }, [fetchJobs, fetchPrefs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Bulk submit: split textarea on whitespace, queue each URL serially
    // (worker is single-flight on this hardware; queueing many at once is
    // fine — they just process in order). 2-job inflight cap is enforced
    // server-side, so we stop submitting once we hit it.
    const urls = url
      .split(/\s+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) {
      setSubmitting(false);
      return;
    }

    const failures: string[] = [];
    let successes = 0;

    try {
      for (const u of urls) {
        const res = await fetch("/api/clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceUrl: u,
            captions: optCaptions,
            music: optMusic,
            punchZooms: optPunch,
            broll: optBroll,
            translateCaptions: optTranslate,
            guidance: guidance.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          failures.push(`${u.slice(0, 60)}${u.length > 60 ? "…" : ""}: ${data.error || "failed"}`);
          // If we hit the inflight cap (429), stop trying — rest will fail too
          if (res.status === 429) break;
        } else {
          successes += 1;
        }
      }

      if (successes > 0 && failures.length === 0) {
        setUrl("");
      } else if (failures.length > 0) {
        setError(
          successes > 0
            ? `Queued ${successes}, but ${failures.length} failed:\n${failures.join("\n")}`
            : failures.join("\n")
        );
      }
      fetchJobs();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this job and its clips?")) return;
    await fetch(`/api/clips/${id}`, { method: "DELETE" });
    fetchJobs();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Scissors className="w-6 h-6 text-accent" />
          Clip Studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a YouTube URL — Whisper transcribes, Gemma picks the moments
          worth clipping.
        </p>
      </div>

      <Card>
        <CardTitle className="text-base mb-3 flex items-center gap-2">
          <Video className="w-4 h-4 text-error" />
          New Clip Job
        </CardTitle>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <textarea
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={
              "https://youtube.com/watch?v=...\n\nOr paste several URLs (one per line) to queue them all."
            }
            required
            disabled={submitting}
            rows={url.includes("\n") ? Math.min(8, url.split("\n").length + 1) : 2}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono resize-none"
          />
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted">
              {(() => {
                const n = url.split(/\s+/).filter((u) => u.trim().length > 0).length;
                return n > 1 ? `${n} URLs queued` : "";
              })()}
            </span>
            <Button type="submit" disabled={submitting || !url.trim()}>
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Find Clips
            </Button>
          </div>
        </form>
        {error && (
          <p className="text-xs text-error mt-2">{error}</p>
        )}
        <div className="flex flex-wrap gap-4 mt-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={optCaptions}
              onChange={(e) => setOptCaptions(e.target.checked)}
              className="accent-accent"
            />
            Word-by-word captions
            <span className="text-[10px] text-muted">(+3-5min)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={optMusic}
              onChange={(e) => setOptMusic(e.target.checked)}
              className="accent-accent"
            />
            Background music
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={optPunch}
              onChange={(e) => setOptPunch(e.target.checked)}
              className="accent-accent"
            />
            Punch zooms + impact SFX
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={optBroll}
              onChange={(e) => setOptBroll(e.target.checked)}
              className="accent-accent"
            />
            B-roll corner overlay
            <span className="text-[10px] text-muted">(beta · +1-2min)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={optTranslate}
              onChange={(e) => setOptTranslate(e.target.checked)}
              className="accent-accent"
            />
            English captions
            <span className="text-[10px] text-muted">(works on Hindi/Punjabi/etc)</span>
          </label>
        </div>
        <div className="mt-3">
          <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
            Custom AI guidance{" "}
            <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value.slice(0, 500))}
            placeholder='e.g. "focus on storytelling moments", "skip self-promo", "find tactical advice clips only"'
            rows={2}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
          />
          <p className="text-[10px] text-muted mt-1">
            Steers the AI picker for THIS job. {500 - guidance.length} chars left.
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Max 3 hr source. Short videos (≤30 min) finish in ~5-10 min. Long
          sources are split into 30-min windows so quality stays high — a
          2-hour podcast typically takes 60-90 min end-to-end. Up to 2 jobs
          at once.
        </p>
        {optBroll && (
          <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
            B-roll finds reference images from Wikipedia (Pexels/Pixabay too if
            keys are set) for proper nouns the speaker mentions. Only added when
            the AI is confident the image actually matches — otherwise skipped.
          </p>
        )}
      </Card>

      {prefs && (
        <Card className="overflow-hidden">
          <button
            onClick={() => setPrefsOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-accent" />
              <CardTitle className="text-base">Publishing preferences</CardTitle>
              {prefs.autoPublish && (
                <Badge variant="accent">Auto-publish ON</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {prefsOpen ? "Hide" : "Edit"}
            </span>
          </button>
          {!prefsOpen && (
            <p className="text-xs text-muted-foreground mt-2">
              {prefs.autoPublish
                ? `Finished clips will auto-schedule to ${prefs.platforms.length || "0"} platform${prefs.platforms.length === 1 ? "" : "s"} (${prefs.clipsPerDay}/day${prefs.skipWeekends ? ", skip weekends" : ""}).`
                : "Set defaults once. Optionally turn on auto-publish to skip the per-job step."}
            </p>
          )}
          {prefsOpen && (
            <div className="mt-4 space-y-4">
              <label className="flex items-start gap-2.5 text-sm cursor-pointer p-3 rounded-lg bg-accent/5 border border-accent/20">
                <input
                  type="checkbox"
                  checked={prefs.autoPublish}
                  onChange={(e) =>
                    setPrefs({ ...prefs, autoPublish: e.target.checked })
                  }
                  className="accent-accent mt-0.5"
                />
                <div>
                  <span className="font-medium">
                    Auto-publish new jobs when clips are ready
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    As soon as a clip job finishes, Klone schedules it across
                    your selected platforms using the settings below — no extra
                    click. Leave off to review each job manually.
                  </p>
                </div>
              </label>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Default platforms
                </label>
                <div className="flex flex-wrap gap-2">
                  {PUBLISH_PLATFORMS.map((p) => {
                    const active = prefs.platforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() =>
                          setPrefs({
                            ...prefs,
                            platforms: active
                              ? prefs.platforms.filter((x) => x !== p.id)
                              : [...prefs.platforms, p.id],
                          })
                        }
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
                  Connect these accounts in{" "}
                  <Link href="/dashboard/accounts" className="text-accent hover:underline">
                    Accounts
                  </Link>{" "}
                  first.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Clips per day
                  </label>
                  <select
                    value={prefs.clipsPerDay}
                    onChange={(e) =>
                      setPrefs({ ...prefs, clipsPerDay: parseInt(e.target.value, 10) })
                    }
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
                    value={prefs.timezone || ""}
                    onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    {prefs.timezone &&
                      !TIMEZONES.includes(prefs.timezone) && (
                        <option value={prefs.timezone}>
                          {prefs.timezone} (your timezone)
                        </option>
                      )}
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.skipWeekends}
                    onChange={(e) =>
                      setPrefs({ ...prefs, skipWeekends: e.target.checked })
                    }
                    className="accent-accent"
                  />
                  Skip weekends
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.withAiHashtags}
                    onChange={(e) =>
                      setPrefs({ ...prefs, withAiHashtags: e.target.checked })
                    }
                    className="accent-accent"
                  />
                  AI-generated hashtags per platform
                </label>
              </div>

              {prefsError && (
                <p className="text-xs text-error">{prefsError}</p>
              )}

              <div className="flex items-center gap-3">
                <Button size="sm" onClick={savePrefs} disabled={prefsSaving}>
                  {prefsSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Save preferences
                    </>
                  )}
                </Button>
                {prefsSavedAt && Date.now() - prefsSavedAt < 4000 && (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <Check className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recent jobs
        </h2>
        {loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Loading…
          </Card>
        ) : jobs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No jobs yet. Paste a URL above to get started.
          </Card>
        ) : (
          jobs.map((job) => {
            const isRunning = job.status === "RUNNING" || job.status === "QUEUED";
            const stageLabel =
              STAGE_LABELS[job.stage || job.status] ?? job.status;
            return (
              <Card key={job.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={STATUS_VARIANT[job.status] || "default"}>
                        {stageLabel}
                      </Badge>
                      {isRunning && (
                        <Loader2 className="w-3 h-3 animate-spin text-accent" />
                      )}
                      {job.status === "DONE" && (
                        <span className="text-xs text-muted-foreground">
                          {job._count.clips} clip
                          {job._count.clips === 1 ? "" : "s"} found
                        </span>
                      )}
                      {job.sourceDuration && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {Math.floor(job.sourceDuration / 60)}m{" "}
                          {job.sourceDuration % 60}s source
                        </span>
                      )}
                    </div>
                    {isRunning && (
                      <div className="mb-2 mt-1.5">
                        <div className="h-1.5 bg-card rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all duration-500 ease-out"
                            style={{ width: `${Math.max(2, job.progress)}%` }}
                          />
                        </div>
                        {job.stageDetail && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {job.stageDetail} · {job.progress}%
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-sm font-medium truncate">
                      {job.sourceTitle || job.sourceUrl}
                    </p>
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-accent inline-flex items-center gap-1 mt-0.5"
                    >
                      {job.sourceUrl.slice(0, 60)}
                      {job.sourceUrl.length > 60 ? "…" : ""}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    {job.error && (
                      <p className="text-xs text-error mt-2">{job.error}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {job.status === "DONE" && job._count.clips > 0 && (
                      <Link href={`/dashboard/clips/${job.id}`}>
                        <Button size="sm">View clips</Button>
                      </Link>
                    )}
                    <button
                      onClick={() => remove(job.id)}
                      disabled={isRunning}
                      className="p-2 text-muted-foreground hover:text-error transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={isRunning ? "Wait for job to finish" : "Delete"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
