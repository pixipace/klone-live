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
  // UI can show "Live · youtube" status pills + a × per-Post delete button.
  // One batched IN-query rather than N per-clip lookups.
  const clipMediaUrls = job.clips
    .map((c) => c.videoPath)
    .filter((v): v is string => v !== null);
  const matchedPosts = clipMediaUrls.length
    ? await prisma.post.findMany({
        where: { userId: session.id, mediaUrl: { in: clipMediaUrls } },
        select: {
          id: true,
          mediaUrl: true,
          status: true,
          platforms: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const postsByClipMediaUrl = new Map<
    string,
    Array<{ id: string; platforms: string[]; status: string }>
  >();
  for (const p of matchedPosts) {
    if (!p.mediaUrl) continue;
    const list = postsByClipMediaUrl.get(p.mediaUrl) ?? [];
    list.push({
      id: p.id,
      platforms: p.platforms ? p.platforms.split(",").filter(Boolean) : [],
      status: p.status,
    });
    postsByClipMediaUrl.set(p.mediaUrl, list);
  }

  return (
    <ClipDetailClient
      job={{
        id: job.id,
        sourceUrl: job.sourceUrl,
        sourceTitle: job.sourceTitle,
        mode: (job.mode === "EXPLAINER" ? "EXPLAINER" : "CLIP") as "CLIP" | "EXPLAINER",
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
          const posts = c.videoPath
            ? postsByClipMediaUrl.get(c.videoPath) ?? []
            : [];
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
            posts,
          };
        }),
      }}
    />
  );
}
