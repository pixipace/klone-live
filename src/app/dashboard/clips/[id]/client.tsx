"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Flame, Clock, Send, Sparkles, Check } from "lucide-react";

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

export function ClipDetailClient({ job }: { job: JobDetail }) {
  const router = useRouter();
  const [titles, setTitles] = useState<Record<string, string>>(() =>
    Object.fromEntries(job.clips.map((c) => [c.id, c.hookTitle]))
  );

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
      <div>
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

              <h3 className="text-base font-semibold leading-snug">
                {titles[clip.id] ?? clip.hookTitle}
              </h3>
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
