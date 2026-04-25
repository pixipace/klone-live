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
          };
        }),
      }}
    />
  );
}
