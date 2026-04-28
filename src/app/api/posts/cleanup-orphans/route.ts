import { NextRequest, NextResponse } from "next/server";
import { stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";

/**
 * Sweep this user's Posts and remove any whose mediaUrl references a
 * file that no longer exists on disk. These accumulate when a user
 * deletes a clip job — historically the Post rows were left behind,
 * causing schedule views to show "publishing now" rows that immediately
 * ENOENT and fail. Background cleanup AND a manual button on the posts
 * page both call this.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const rl = enforceRateLimit(request, session.id, "posts:cleanup", 10);
  if (rl) return rl;

  // Only consider posts whose mediaUrl is local (we serve it ourselves —
  // remote URLs are out of scope for "file missing" detection).
  const posts = await prisma.post.findMany({
    where: {
      userId: session.id,
      mediaUrl: { startsWith: "/api/uploads/" },
    },
    select: { id: true, mediaUrl: true, status: true },
  });

  const orphanIds: string[] = [];
  const cancelIds: string[] = [];
  for (const p of posts) {
    if (!p.mediaUrl) continue;
    const filename = p.mediaUrl.replace(/^\/api\/uploads\//, "");
    if (!filename || filename.includes("..")) continue;
    const filepath = path.join(process.cwd(), ".uploads", filename);
    try {
      await stat(filepath);
    } catch {
      orphanIds.push(p.id);
      if (p.status === "SCHEDULED" || p.status === "QUEUED" || p.status === "POSTING") {
        cancelIds.push(p.id);
      }
    }
  }

  if (cancelIds.length > 0) {
    await prisma.post.updateMany({
      where: { id: { in: cancelIds } },
      data: {
        status: "FAILED",
        results: JSON.stringify({
          cancelled: { error: "Source media file was deleted" },
        }),
      },
    });
  }
  if (orphanIds.length > 0) {
    await prisma.post.deleteMany({ where: { id: { in: orphanIds } } });
  }

  return NextResponse.json({
    removed: orphanIds.length,
    cancelled: cancelIds.length,
  });
}
