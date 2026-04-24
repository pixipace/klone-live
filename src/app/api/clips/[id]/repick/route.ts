import { NextRequest, NextResponse } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/clips/[id]/repick">
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const job = await prisma.clipJob.findFirst({
    where: { id, userId: session.id },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "DONE" && job.status !== "FAILED") {
    return NextResponse.json(
      { error: "Job must be DONE or FAILED to re-pick" },
      { status: 400 }
    );
  }
  if (!job.cachedTranscript) {
    return NextResponse.json(
      {
        error:
          "No cached transcript — this job ran before re-pick was supported. Delete and re-submit instead.",
      },
      { status: 400 }
    );
  }

  // Wipe existing clips (DB + on-disk files) so the pipeline regenerates.
  await prisma.clip.deleteMany({ where: { jobId: id } });
  if (/^[a-z0-9]+$/i.test(id)) {
    const clipsDir = path.join(process.cwd(), ".uploads", "clips", id);
    await rm(clipsDir, { recursive: true, force: true }).catch(() => {});
  }

  // Re-queue. Pipeline will see cachedTranscript and skip transcribe stage.
  await prisma.clipJob.update({
    where: { id },
    data: {
      status: "QUEUED",
      stage: null,
      stageDetail: "Re-picking — using cached transcript",
      progress: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
    },
  });

  return NextResponse.json({ success: true, queued: true });
}
