import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";

/**
 * Delete a single Post owned by the session user. Refuses to delete
 * RUNNING (status=POSTING) posts to avoid mid-publish race conditions.
 * Cleans up the local mediaUrl file IF no other Post still references it.
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = enforceRateLimit(request, session.id, "posts:delete", 30);
  if (rl) return rl;
  const { id } = await ctx.params;

  const post = await prisma.post.findFirst({
    where: { id, userId: session.id },
    select: { id: true, status: true, mediaUrl: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (post.status === "POSTING") {
    return NextResponse.json(
      { error: "Post is publishing right now — wait for it to finish" },
      { status: 409 }
    );
  }

  await prisma.post.delete({ where: { id: post.id } });

  // If no other Post still uses this media file, delete it. Auto-distribute
  // creates many Posts that all point at the same clip MP4 — only the LAST
  // surviving Post triggers the file deletion. Also keep the file alive if a
  // Clip still references it as videoPath (clip detail page would otherwise
  // 404 the video right after a per-clip post is deleted).
  if (post.mediaUrl?.startsWith("/api/uploads/")) {
    const [otherPosts, owningClip] = await Promise.all([
      prisma.post.count({ where: { mediaUrl: post.mediaUrl } }),
      prisma.clip.count({ where: { videoPath: post.mediaUrl } }),
    ]);
    if (otherPosts === 0 && owningClip === 0) {
      const filename = post.mediaUrl.replace(/^\/api\/uploads\//, "");
      const filePath = path.join(process.cwd(), ".uploads", filename);
      unlink(filePath).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
