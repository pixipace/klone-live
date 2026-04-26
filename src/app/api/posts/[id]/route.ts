import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Delete a single Post owned by the session user. Refuses to delete
 * RUNNING (status=POSTING) posts to avoid mid-publish race conditions.
 * Cleans up the local mediaUrl file IF no other Post still references it.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
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
  // surviving Post triggers the file deletion.
  if (post.mediaUrl?.startsWith("/api/uploads/")) {
    const stillReferenced = await prisma.post.count({
      where: { mediaUrl: post.mediaUrl },
    });
    if (stillReferenced === 0) {
      const filename = post.mediaUrl.replace(/^\/api\/uploads\//, "");
      const filePath = path.join(process.cwd(), ".uploads", filename);
      unlink(filePath).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
