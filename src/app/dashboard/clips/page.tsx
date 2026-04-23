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
} from "lucide-react";

type ClipJob = {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourceDuration: number | null;
  status: string;
  stage: string | null;
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

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/clips");
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
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to queue job");
      } else {
        setUrl("");
        fetchJobs();
      }
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
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            required
            disabled={submitting}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <Button type="submit" disabled={submitting || !url.trim()}>
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Find Clips
          </Button>
        </form>
        {error && (
          <p className="text-xs text-error mt-2">{error}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          Max 30 min source. Processing takes ~3-5 min depending on length. Up
          to 2 jobs at once.
        </p>
      </Card>

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
