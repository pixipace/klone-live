"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { VoiceReferencePanel } from "../clips/voice-reference-panel";
import {
  Sparkles,
  Loader2,
  Trash2,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  ExternalLink,
  ArrowRight,
  Shield,
} from "lucide-react";

/**
 * Explainer Studio — dedicated page for the AI-narrated documentary
 * pipeline. Same backend as Clip Studio (ClipJob.mode = "EXPLAINER")
 * but with focused UI: explainer-only copy, voice reference always
 * visible, no mode toggle to confuse the choice.
 *
 * The reason this is its own page: explainer is the differentiated
 * feature. Burying it as a tab inside Clip Studio meant new users
 * never discovered it. A sidebar slot puts it at eye-level.
 */

type ExplainerJob = {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceDuration: number | null;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED" | string;
  stage: string;
  stageDetail: string | null;
  progress: number;
  mode: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  _count: { clips: number };
};

const YT_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i;

export default function ExplainerStudioPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<ExplainerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [guidance, setGuidance] = useState("");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/clips?mode=EXPLAINER");
      const data = await res.json();
      if (res.ok) setJobs(data.jobs || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const t = setInterval(fetchJobs, 5000);
    return () => clearInterval(t);
  }, [fetchJobs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    // Bulk submit: split on whitespace, queue each. Frontend feedback
    // per-URL so users see exactly which ones failed.
    const urls = url.split(/\s+/).filter((u) => u.length > 0);
    if (urls.length === 0) return;

    setSubmitting(true);
    let successCount = 0;
    const errors: string[] = [];

    for (const single of urls) {
      if (!YT_RE.test(single)) {
        errors.push(`Skipped ${single} — only YouTube URLs supported`);
        continue;
      }
      try {
        const res = await fetch("/api/clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceUrl: single,
            mode: "EXPLAINER",
            captions: true,
            music: true,
            // Punch zooms + b-roll are clip-mode concerns; explainer's
            // visual layer is the per-line image planner instead.
            punchZooms: false,
            broll: false,
            guidance: guidance.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          successCount++;
        } else {
          errors.push(`${single} — ${data.error || "Submit failed"}`);
        }
      } catch (err) {
        errors.push(`${single} — ${String(err).slice(0, 100)}`);
      }
    }

    if (successCount > 0) {
      toast.success(
        `${successCount} explainer job${successCount === 1 ? "" : "s"} queued`,
        errors.length > 0 ? `${errors.length} skipped — see error below` : undefined,
      );
      setUrl("");
      setGuidance("");
      fetchJobs();
    }
    if (errors.length > 0 && successCount === 0) {
      toast.error("Couldn't queue jobs", errors[0]);
    }
    setSubmitting(false);
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Delete this explainer job?",
      description: "Removes the job and its rendered explainer videos. Cannot be undone.",
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
      {/* Header — sets the page identity. Pairs the Sparkles icon with
          a clear "what this does" line so users instantly know they're
          in the right place. */}
      <div>
        <div className="flex items-center gap-2.5 mb-1.5">
          <Sparkles className="w-5 h-5 text-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Explainer Studio</h1>
          <Badge variant="success" className="ml-1">copyright-safe</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Drop any YouTube URL — Klone analyzes the source, picks the most
          viral conclusions, and narrates documentary-style explainers in your
          voice. Source audio never plays. Safe for any source.
        </p>
      </div>

      {/* Voice reference — explainer-specific, surfaces immediately so
          users know this is where the narrator voice gets cloned. */}
      <VoiceReferencePanel />

      {/* New job form */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            New explainer
          </CardTitle>
          <Link
            href="/dashboard/clips"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            Want plain clips instead?
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <textarea
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              rows={2}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all resize-none"
            />
            <p className="text-[11px] text-muted mt-1">
              Paste 1-5 YouTube URLs (whitespace-separated). Max 3 hours each.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Optional: tell Gemma what to focus on
            </label>
            <input
              type="text"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="e.g. focus on the contrarian moments, skip the intro"
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all"
            />
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Shield className="w-3 h-3" />
              No source audio used — copyright-safe
            </div>
            <Button type="submit" disabled={submitting || !url.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Queueing…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate explainer
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Job list — empty state, loading skeleton, or rows */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">
            Recent jobs
          </h2>
          {jobs.length > 0 && (
            <span className="text-[11px] text-muted tabular-nums">
              {jobs.length} job{jobs.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                <div className="h-3 w-2/3 bg-foreground/8 rounded mb-2" />
                <div className="h-2 w-1/3 bg-foreground/8 rounded" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Sparkles className="w-5 h-5" />}
              title="No explainer jobs yet"
              description="Paste a YouTube URL above to generate your first AI-narrated explainer. Gemma extracts the viral conclusions, your voice narrates them, and the source plays silently underneath."
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onRemove={remove} onRetry={retry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobRow({
  job,
  onRemove,
  onRetry,
}: {
  job: ExplainerJob;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const isRunning = job.status === "QUEUED" || job.status === "RUNNING";
  const isDone = job.status === "DONE";
  const isFailed = job.status === "FAILED";

  const StatusIcon = isDone ? CheckCircle2 : isFailed ? AlertCircle : Clock;
  const statusColor = isDone
    ? "text-success"
    : isFailed
    ? "text-error"
    : "text-foreground-secondary";

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-border-hover transition-colors group">
      <div className="flex items-start gap-3">
        <StatusIcon className={`w-4 h-4 shrink-0 mt-0.5 ${statusColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-foreground truncate">
              {job.sourceTitle || "Loading title…"}
            </p>
            {isDone && (
              <Badge variant="success">
                {job._count.clips} explainer{job._count.clips === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate font-mono">
            {job.sourceUrl}
          </p>
          {isRunning && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>{job.stageDetail || job.stage}</span>
                <span className="tabular-nums">{job.progress}%</span>
              </div>
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all duration-500"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            </div>
          )}
          {isFailed && job.error && (
            <p className="text-[11px] text-error mt-1.5">{job.error.slice(0, 200)}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {isDone && (
            <Link
              href={`/dashboard/clips/${job.id}`}
              className="p-1.5 text-muted hover:text-foreground transition-colors"
              title="View explainers"
            >
              <Play className="w-3.5 h-3.5" />
            </Link>
          )}
          {isFailed && (
            <button
              onClick={() => onRetry(job.id)}
              className="text-[11px] px-2 py-1 rounded border border-border hover:border-border-hover text-foreground-secondary hover:text-foreground transition-colors"
            >
              Retry
            </button>
          )}
          {!isRunning && (
            <button
              onClick={() => onRemove(job.id)}
              className="p-1.5 text-muted hover:text-error transition-colors"
              title="Delete job"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-muted hover:text-foreground transition-colors"
            title="Open source"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
