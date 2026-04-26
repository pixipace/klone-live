import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Lightweight per-user counts for sidebar badges. Returns:
 *   - failedPosts (FAILED status, last 14d) — surfaces post-publish failures
 *     so the user knows to look without having to click Posts
 *   - runningClips (clip jobs in QUEUED or RUNNING) — shows the user when
 *     work is in flight in the background
 *   - scheduledPosts (count of posts queued to go out) — useful for at-a-glance
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000);

  const [failedPosts, runningClips, scheduledPosts] = await Promise.all([
    prisma.post.count({
      where: {
        userId: session.id,
        status: "FAILED",
        createdAt: { gte: fourteenDaysAgo },
      },
    }),
    prisma.clipJob.count({
      where: {
        userId: session.id,
        status: { in: ["QUEUED", "RUNNING"] },
      },
    }),
    prisma.post.count({
      where: { userId: session.id, status: "SCHEDULED" },
    }),
  ]);

  return NextResponse.json({
    failedPosts,
    runningClips,
    scheduledPosts,
  });
}
