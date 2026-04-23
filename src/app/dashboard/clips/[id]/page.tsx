import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Flame, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default async function ClipJobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const job = await prisma.clipJob.findFirst({
    where: { id, userId: session.id },
    include: { clips: { orderBy: { startSec: "asc" } } },
  });

  if (!job) notFound();

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
                {clip.hookTitle}
              </h3>
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
                    <Button size="sm" disabled title="Coming in Stage 3">
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
