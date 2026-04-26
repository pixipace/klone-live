import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ALL_PLATFORMS, type PlatformId } from "@/lib/platforms";
import { autoDistributeClips } from "@/lib/clipper/distribute";

const PLATFORM_SET = new Set<PlatformId>(ALL_PLATFORMS);

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/clips/[id]/auto-distribute">
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await request.json();
  const {
    platforms = [],
    clipsPerDay = 1,
    skipWeekends = true,
    withAiHashtags = true,
  } = body as {
    platforms?: string[];
    clipsPerDay?: number;
    skipWeekends?: boolean;
    withAiHashtags?: boolean;
  };

  const validPlatforms = (platforms as string[]).filter((p): p is PlatformId =>
    PLATFORM_SET.has(p as PlatformId)
  );
  if (validPlatforms.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one platform" },
      { status: 400 }
    );
  }
  const cadence = Math.max(1, Math.min(5, Math.floor(Number(clipsPerDay) || 1)));

  // Verify the user owns the job + has clips ready
  const job = await prisma.clipJob.findFirst({
    where: { id, userId: session.id },
    include: {
      clips: {
        where: { videoPath: { not: null } },
        orderBy: { startSec: "asc" },
      },
    },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.clips.length === 0) {
    return NextResponse.json(
      { error: "No clips ready yet — wait for the job to finish" },
      { status: 400 }
    );
  }

  // Verify the user has the social accounts connected
  const connected = await prisma.socialAccount.findMany({
    where: { userId: session.id, platform: { in: validPlatforms } },
    select: { platform: true },
  });
  const connectedSet = new Set(connected.map((c) => c.platform));
  const missing = validPlatforms.filter((p) => !connectedSet.has(p));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Connect these accounts first: ${missing.join(", ")}`,
        missing,
      },
      { status: 400 }
    );
  }

  // User's saved default hashtags get prepended to AI tags per (clip × platform)
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { clipperDefaultHashtags: true },
  });
  const userHashtags = (user?.clipperDefaultHashtags ?? "")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const result = await autoDistributeClips({
    userId: session.id,
    clips: job.clips,
    platforms: validPlatforms,
    clipsPerDay: cadence,
    skipWeekends,
    withAiHashtags,
    userHashtags,
  });

  return NextResponse.json({
    success: true,
    scheduled: result.scheduled,
    firstAt: result.firstAt,
    lastAt: result.lastAt,
  });
}
