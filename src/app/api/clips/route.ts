import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { probeYouTubeDuration } from "@/lib/clipper/youtube";
import { enforceRateLimit } from "@/lib/api-rate-limit";

const YT_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i;
const MAX_SOURCE_SEC = 3 * 60 * 60; // 3 hours

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Optional ?mode=CLIP|EXPLAINER filter — used by the dedicated
  // /dashboard/explainer + /dashboard/clips pages so each shows only
  // its own jobs. Anything else returns the full list (back-compat).
  const modeFilter = request.nextUrl.searchParams.get("mode");
  const where: { userId: string; mode?: "CLIP" | "EXPLAINER" } = { userId: session.id };
  if (modeFilter === "CLIP" || modeFilter === "EXPLAINER") {
    where.mode = modeFilter;
  }

  const jobs = await prisma.clipJob.findMany({
    where,
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
      mode: j.mode,
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

  // Heavy op — clip job submission triggers download + whisper + ffmpeg
  const rl = enforceRateLimit(request, session.id, "clips:submit", 10);
  if (rl) return rl;

  const body = await request.json();
  const {
    sourceUrl,
    mode = "CLIP",
    captions = true,
    music = true,
    punchZooms = true,
    broll = false,
    translateCaptions = false,
    guidance,
  } = body as {
    sourceUrl?: string;
    mode?: string;
    captions?: boolean;
    music?: boolean;
    punchZooms?: boolean;
    broll?: boolean;
    translateCaptions?: boolean;
    guidance?: string;
  };
  // Mode: CLIP = traditional source-extraction; EXPLAINER = AI-narrated
  // commentary video using silent source cutaways. Anything else falls
  // back to CLIP for safety.
  const jobMode: "CLIP" | "EXPLAINER" = mode === "EXPLAINER" ? "EXPLAINER" : "CLIP";

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
      mode: jobMode,
      optCaptions: !!captions,
      optMusic: !!music,
      optPunchZooms: !!punchZooms,
      optBroll: !!broll,
      optTranslateCaptions: !!translateCaptions,
      pickerGuidance: typeof guidance === "string" && guidance.trim().length > 0
        ? guidance.trim().slice(0, 500)
        : null,
    },
  });

  return NextResponse.json({ jobId: job.id, status: "QUEUED" });
}
