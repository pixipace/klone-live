import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Retry a FAILED job — re-queues it with the same toggles + URL. If a
 * cachedTranscript exists, the pipeline will reuse it (fast path).
 * Otherwise the job runs from scratch.
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
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
  if (job.status !== "FAILED") {
    return NextResponse.json(
      { error: "Only FAILED jobs can be retried" },
      { status: 400 }
    );
  }

  const inflight = await prisma.clipJob.count({
    where: {
      userId: session.id,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (inflight >= 2) {
    return NextResponse.json(
      { error: "You already have 2 jobs running. Wait for them to finish." },
      { status: 429 }
    );
  }

  await prisma.clipJob.update({
    where: { id },
    data: {
      status: "QUEUED",
      stage: null,
      stageDetail: "Retrying",
      progress: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
    },
  });

  return NextResponse.json({ success: true, queued: true });
}
