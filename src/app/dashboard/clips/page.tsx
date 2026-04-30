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
  Upload,
  Link as LinkIcon,
} from "lucide-react";
import { VoiceReferencePanel } from "./voice-reference-panel";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

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
  captionStyle: "classic" | "bold" | "yellow";
  endCardText: string;
  defaultHashtags: string;
};

const CAPTION_STYLES = [
  { id: "bold", label: "Bold", desc: "One word at a time, huge white text + stroke (CapCut/TikTok default)" },
  { id: "yellow", label: "Yellow", desc: "One word at a time, huge yellow text + stroke" },
  { id: "classic", label: "Classic", desc: "Two words + black box (legacy Opus-style)" },
] as const;

type ClipJob = {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceDuration: number | null;
  status: string;
  stage: string | null;
  stageDetail: string | null;
  progress: number;
  mode: "CLIP" | "EXPLAINER" | string;
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
  const confirm = useConfirm();
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"url" | "upload">("url");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ClipJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [optCaptions, setOptCaptions] = useState(true);
  const [optMusic, setOptMusic] = useState(true);
  const [optPunch, setOptPunch] = useState(true);
  const [optBroll, setOptBroll] = useState(false);
  const [optTranslate, setOptTranslate] = useState(false);
  // Pipeline: CLIP extracts source moments (existing behaviour); EXPLAINER
  // generates AI-narrated commentary videos with silent source cutaways
  // (zero source-audio = no Content ID match, copyright-safe).
  const [pipelineMode, setPipelineMode] = useState<"CLIP" | "EXPLAINER">("CLIP");
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

  // Connected-platform set for gating the publishing-prefs picker.
  // Fetched once on mount alongside prefs. Same pattern as create page.
  const [connectedSet, setConnectedSet] = useState<Set<string> | null>(null);

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
          captionStyle: (data.captionStyle === "classic" || data.captionStyle === "yellow"
            ? data.captionStyle
            : "bold") as "classic" | "bold" | "yellow",
          endCardText: typeof data.endCardText === "string" ? data.endCardText : "",
          defaultHashtags: typeof data.defaultHashtags === "string" ? data.defaultHashtags : "",
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
    // Connected platforms — used to gate the publishing-prefs picker
    // and the auto-publish toggle (can't auto-publish if zero connected).
    fetch("/api/accounts/connected")
      .then((r) => r.json())
      .then((d) => setConnectedSet(new Set(Array.isArray(d.connected) ? d.connected : [])))
      .catch(() => setConnectedSet(new Set()));
    const t = setInterval(fetchJobs, 5000);
    return () => clearInterval(t);
  }, [fetchJobs, fetchPrefs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "upload") {
        if (!uploadFile) {
          setError("Pick a video file to upload");
          return;
        }
        const fd = new FormData();
        fd.append("file", uploadFile);
        fd.append("captions", String(optCaptions));
        fd.append("music", String(optMusic));
        fd.append("punchZooms", String(optPunch));
        fd.append("broll", String(optBroll));
        fd.append("translateCaptions", String(optTranslate));
        if (guidance.trim()) fd.append("guidance", guidance.trim());
        const res = await fetch("/api/clips/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Upload failed");
        } else {
          setUploadFile(null);
          fetchJobs();
        }
        return;
      }

      // URL mode — bulk submit: split on whitespace, queue each serially.
      const urls = url
        .split(/\s+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      if (urls.length === 0) return;

      const failures: string[] = [];
      let successes = 0;

      for (const u of urls) {
        const res = await fetch("/api/clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceUrl: u,
            mode: pipelineMode,
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
    const ok = await confirm({
      title: "Delete this clip job?",
      description: "Removes the job, its rendered clips, and any scheduled posts that reference them. This cannot be undone.",
      destructive: true,
      confirmLabel: "Delete job",
    });
    if (!ok) return;
    await fetch(`/api/clips/${id}`, { method: "DELETE" });
    toast.success("Job deleted");
    fetchJobs();
  };

  const retry = async (id: string) => {
    const res = await fetch(`/api/clips/${id}/retry`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("Retry failed", data.error || "Please try again");
      return;
    }
    toast.success("Job re-queued");
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
          New Job
        </CardTitle>

        {/* Pipeline mode picker — most important choice on the page, so it
         *  goes first. CLIP = traditional source extraction. EXPLAINER =
         *  AI-narrated commentary in our voice with silent source cutaways
         *  (zero source-audio = copyright-safe). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setPipelineMode("CLIP")}
            className={`text-left p-3 rounded-lg border-2 transition-all ${
              pipelineMode === "CLIP"
                ? "border-accent bg-accent/5"
                : "border-border bg-card hover:border-accent/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Video className="w-4 h-4 text-error" />
              <span className="font-semibold text-sm">Clip Mode</span>
              {pipelineMode === "CLIP" && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-accent text-white">
                  selected
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Extract viral moments from the source. Best for friendly sources
              (your own podcasts, Lex Fridman, JRE). Faster, source audio
              preserved.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setPipelineMode("EXPLAINER")}
            className={`text-left p-3 rounded-lg border-2 transition-all ${
              pipelineMode === "EXPLAINER"
                ? "border-success bg-success/5"
                : "border-border bg-card hover:border-success/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-success" />
              <span className="font-semibold text-sm">Explainer Mode</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30">
                copyright-safe
              </span>
              {pipelineMode === "EXPLAINER" && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-success text-white">
                  selected
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              AI analyzes the source, narrates explainers in our voice with
              silent source cutaways. No source audio used. Safe for any
              source — MrBeast, Disney, IPL, news.
            </p>
          </button>
        </div>

        {pipelineMode === "EXPLAINER" && <VoiceReferencePanel />}

        <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-card border border-border w-fit">
          <button
            onClick={() => setMode("url")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
              mode === "url" ? "bg-accent text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            YouTube URL
          </button>
          <button
            onClick={() => setMode("upload")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
              mode === "upload" ? "bg-accent text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload file
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-2">
          {mode === "url" ? (
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
          ) : (
            <div className="border border-dashed border-border rounded-lg p-5 text-center">
              <input
                id="clip-upload"
                type="file"
                accept="video/mp4,video/quicktime,video/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                disabled={submitting}
                className="hidden"
              />
              <label
                htmlFor="clip-upload"
                className="cursor-pointer inline-flex flex-col items-center gap-2"
              >
                <Upload className="w-6 h-6 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {uploadFile ? uploadFile.name : "Choose an MP4 file"}
                </span>
                {uploadFile && (
                  <span className="text-[11px] text-muted">
                    {(uploadFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                )}
                {!uploadFile && (
                  <span className="text-[11px] text-muted">
                    Max 1 GB · use a YouTube URL for longer videos
                  </span>
                )}
              </label>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted">
              {mode === "url"
                ? (() => {
                    const n = url.split(/\s+/).filter((u) => u.trim().length > 0).length;
                    return n > 1 ? `${n} URLs queued` : "";
                  })()
                : ""}
            </span>
            <Button
              type="submit"
              disabled={
                submitting ||
                (mode === "url" ? !url.trim() : !uploadFile)
              }
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {mode === "upload"
                ? pipelineMode === "EXPLAINER"
                  ? "Upload & Generate Explainers"
                  : "Upload & Find Clips"
                : pipelineMode === "EXPLAINER"
                  ? "Generate Explainers"
                  : "Find Clips"}
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
            placeholder='e.g. "find every wicket moment", "all goals + reactions", "focus on storytelling", "skip self-promo", "each tutorial step"'
            rows={2}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
          />
          <p className="text-[10px] text-muted mt-1">
            Steers the AI picker for THIS job. Specific event types
            (&ldquo;every wicket&rdquo;, &ldquo;all goals&rdquo;) override
            the default viral filter and find ALL instances. Style notes
            (&ldquo;skip self-promo&rdquo;) filter the existing picks.{" "}
            {500 - guidance.length} chars left.
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
              {prefs.autoPublish && prefs.platforms.length > 0 && (
                <Badge variant="accent">Auto-publish ON</Badge>
              )}
              {prefs.autoPublish && prefs.platforms.length === 0 && (
                <Badge variant="warning">Auto-publish set but NO platforms</Badge>
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
              {/* Auto-publish toggle — gated on having at least one
                  platform selected. Server-side rejects this combo too,
                  but disabling here means the user can't accidentally
                  flip it on and wonder why nothing's posting later. */}
              {(() => {
                const canEnableAuto = prefs.platforms.length > 0;
                return (
                  <label
                    className={`flex items-start gap-2.5 text-sm p-3 rounded-md bg-accent-soft border border-accent/20 ${
                      canEnableAuto || prefs.autoPublish ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={prefs.autoPublish}
                      disabled={!canEnableAuto && !prefs.autoPublish}
                      onChange={async (e) => {
                        const next = { ...prefs, autoPublish: e.target.checked };
                        setPrefs(next);
                        try {
                          const res = await fetch("/api/user/clipper-prefs", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(next),
                          });
                          if (res.ok) {
                            toast.success(e.target.checked ? "Auto-publish ON" : "Auto-publish OFF");
                            setPrefsSavedAt(Date.now());
                          } else {
                            // Surface the server error AND revert the
                            // optimistic UI flip — was silently swallowed before.
                            const data = await res.json().catch(() => ({}));
                            toast.error("Couldn't save auto-publish", data.error || "Please try again");
                            setPrefs((p) => p ? { ...p, autoPublish: !e.target.checked } : p);
                          }
                        } catch {
                          toast.error("Network error", "Couldn't save your change");
                          setPrefs((p) => p ? { ...p, autoPublish: !e.target.checked } : p);
                        }
                      }}
                      className="accent-accent mt-0.5"
                    />
                    <div>
                      <span className="font-medium">
                        Auto-publish new jobs when clips are ready
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {canEnableAuto
                          ? "As soon as a clip job finishes, Klone schedules it across your selected platforms — no extra click."
                          : "Pick at least one platform below to enable auto-publish."}{" "}
                        {canEnableAuto && <span className="text-accent">Saves automatically.</span>}
                      </p>
                    </div>
                  </label>
                );
              })()}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Default platforms
                </label>
                <div className="flex flex-wrap gap-2">
                  {PUBLISH_PLATFORMS.map((p) => {
                    const active = prefs.platforms.includes(p.id);
                    // null = still loading; treat as enabled to avoid layout flash
                    const isConnected = connectedSet === null || connectedSet.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (!isConnected) return;
                          setPrefs({
                            ...prefs,
                            platforms: active
                              ? prefs.platforms.filter((x) => x !== p.id)
                              : [...prefs.platforms, p.id],
                          });
                        }}
                        disabled={!isConnected}
                        title={
                          isConnected
                            ? undefined
                            : `Connect ${p.name} in /dashboard/accounts to enable`
                        }
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition-all ${
                          !isConnected
                            ? "border-border bg-card/50 text-muted opacity-50 cursor-not-allowed"
                            : active
                            ? "border-foreground bg-foreground/5 text-foreground"
                            : "border-border bg-card text-foreground-secondary hover:border-border-hover"
                        }`}
                      >
                        <div
                          className="w-4 h-4 rounded text-white text-[8px] font-bold flex items-center justify-center"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name[0]}
                        </div>
                        {p.name}
                        {!isConnected && (
                          <span className="text-[9px] text-muted">not connected</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted mt-2">
                  Connect missing accounts in{" "}
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

              <div className="border-t border-border/40 pt-4 mt-2">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Caption style
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CAPTION_STYLES.map((s) => {
                    const active = prefs.captionStyle === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() =>
                          setPrefs({ ...prefs, captionStyle: s.id })
                        }
                        className={`text-left p-3 rounded-lg border text-xs transition-all ${
                          active
                            ? "border-accent bg-accent/10"
                            : "border-border bg-card hover:border-border-hover"
                        }`}
                      >
                        <div className="font-medium mb-0.5">{s.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {s.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  End card text{" "}
                  <span className="text-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={prefs.endCardText}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      endCardText: e.target.value.slice(0, 60),
                    })
                  }
                  placeholder="@yourhandle"
                  maxLength={60}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <p className="text-[10px] text-muted mt-1">
                  Shown over the last 1.5 seconds of every clip with{" "}
                  &ldquo;more like this&rdquo; below it. Leave empty to skip.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Always-include hashtags{" "}
                  <span className="text-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={prefs.defaultHashtags}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      defaultHashtags: e.target.value,
                    })
                  }
                  placeholder="#yourniche #yourbrand #channelname"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 font-mono"
                />
                <p className="text-[10px] text-muted mt-1">
                  These get prepended to the AI-generated tags on every
                  auto-published post. Comma- or space-separated, # is optional
                  (auto-added). Use this when you want every clip to land in a
                  specific niche feed regardless of what the AI picks.
                </p>
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
                      {job.mode === "EXPLAINER" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-medium border border-success/30 inline-flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          Explainer
                        </span>
                      )}
                      {isRunning && (
                        <Loader2 className="w-3 h-3 animate-spin text-accent" />
                      )}
                      {job.status === "DONE" && (
                        <span className="text-xs text-muted-foreground">
                          {job._count.clips}{" "}
                          {job.mode === "EXPLAINER"
                            ? `explainer${job._count.clips === 1 ? "" : "s"}`
                            : `clip${job._count.clips === 1 ? "" : "s"} found`}
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
                    {job.status === "FAILED" && (
                      <Button size="sm" variant="outline" onClick={() => retry(job.id)}>
                        Retry
                      </Button>
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
