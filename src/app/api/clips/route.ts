import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { probeYouTubeDuration } from "@/lib/clipper/youtube";

const YT_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i;
const MAX_SOURCE_SEC = 30 * 60;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const jobs = await prisma.clipJob.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      _count: { select: { clips: true } },
    },
  });

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      sourceUrl: j.sourceUrl,
      sourceTitle: j.sourceTitle,
      sourceDuration: j.sourceDuration,
      status: j.status,
      stage: j.stage,
      stageDetail: j.stageDetail,
      progress: j.progress,
      error: j.error,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      createdAt: j.createdAt,
      _count: j._count,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const {
    sourceUrl,
    captions = true,
    music = true,
    punchZooms = true,
  } = body as {
    sourceUrl?: string;
    captions?: boolean;
    music?: boolean;
    punchZooms?: boolean;
  };

  if (!sourceUrl || typeof sourceUrl !== "string") {
    return NextResponse.json({ error: "Missing sourceUrl" }, { status: 400 });
  }
  if (!YT_RE.test(sourceUrl)) {
    return NextResponse.json(
      { error: "Only YouTube URLs supported for now" },
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

  let durationSec = 0;
  try {
    durationSec = await probeYouTubeDuration(sourceUrl.trim());
  } catch (err) {
    return NextResponse.json(
      { error: `Could not load video metadata: ${String(err).slice(0, 200)}` },
      { status: 400 }
    );
  }

  if (durationSec > MAX_SOURCE_SEC) {
    return NextResponse.json(
      {
        error: `Video is ${Math.round(durationSec / 60)} min. Max source length is ${
          MAX_SOURCE_SEC / 60
        } min.`,
      },
      { status: 400 }
    );
  }

  const job = await prisma.clipJob.create({
    data: {
      userId: session.id,
      sourceUrl: sourceUrl.trim(),
      sourceDuration: Math.round(durationSec),
      status: "QUEUED",
      optCaptions: !!captions,
      optMusic: !!music,
      optPunchZooms: !!punchZooms,
    },
  });

  return NextResponse.json({ jobId: job.id, status: "QUEUED" });
}
