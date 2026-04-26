import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ClipDetailClient } from "./client";

export const dynamic = "force-dynamic";

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

  // For each rendered clip, find Posts that point at its videoPath so the
  // UI can show "Live on N platforms · Scheduled on M" status. Cheaper as
  // ONE batched IN-query than N per-clip lookups.
  const clipMediaUrls = job.clips
    .map((c) => c.videoPath)
    .filter((v): v is string => v !== null);
  const matchedPosts = clipMediaUrls.length
    ? await prisma.post.findMany({
        where: { userId: session.id, mediaUrl: { in: clipMediaUrls } },
        select: {
          mediaUrl: true,
          status: true,
          platforms: true,
          scheduledFor: true,
          postedAt: true,
        },
      })
    : [];

  const postStatusByClipMediaUrl = new Map<
    string,
    { live: string[]; scheduled: string[]; failed: string[] }
  >();
  for (const p of matchedPosts) {
    if (!p.mediaUrl) continue;
    const platforms = p.platforms ? p.platforms.split(",") : [];
    const bucket =
      postStatusByClipMediaUrl.get(p.mediaUrl) ??
      { live: [], scheduled: [], failed: [] };
    for (const plat of platforms) {
      if (p.status === "POSTED" || p.status === "PARTIAL") {
        if (!bucket.live.includes(plat)) bucket.live.push(plat);
      } else if (p.status === "SCHEDULED" || p.status === "POSTING") {
        if (!bucket.scheduled.includes(plat)) bucket.scheduled.push(plat);
      } else if (p.status === "FAILED") {
        if (!bucket.failed.includes(plat)) bucket.failed.push(plat);
      }
    }
    postStatusByClipMediaUrl.set(p.mediaUrl, bucket);
  }

  return (
    <ClipDetailClient
      job={{
        id: job.id,
        sourceUrl: job.sourceUrl,
        sourceTitle: job.sourceTitle,
        highlightReelPath: job.highlightReelPath,
        highlightReelThumb: job.highlightReelThumb,
        highlightReelHook: job.highlightReelHook,
        clips: job.clips.map((c) => {
          let hookVariants: string[] = [];
          if (c.hookVariants) {
            try {
              const parsed = JSON.parse(c.hookVariants);
              if (Array.isArray(parsed))
                hookVariants = parsed.filter((t): t is string => typeof t === "string");
            } catch {
              // ignore
            }
          }
          const status = c.videoPath
            ? postStatusByClipMediaUrl.get(c.videoPath) ?? {
                live: [],
                scheduled: [],
                failed: [],
              }
            : { live: [], scheduled: [], failed: [] };
          return {
            id: c.id,
            startSec: c.startSec,
            endSec: c.endSec,
            durationSec: c.durationSec,
            hookTitle: c.hookTitle,
            hookVariants,
            reason: c.reason,
            viralityScore: c.viralityScore,
            transcript: c.transcript,
            videoPath: c.videoPath,
            thumbnailPath: c.thumbnailPath,
            musicAttribution: c.musicAttribution,
            publicShareEnabled: c.publicShareEnabled,
            postStatus: status,
          };
        }),
      }}
    />
  );
}
