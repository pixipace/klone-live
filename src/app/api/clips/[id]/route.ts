import { NextRequest, NextResponse } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/clips/[id]">
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const job = await prisma.clipJob.findFirst({
    where: { id, userId: session.id },
    include: {
      clips: { orderBy: { startSec: "asc" } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/clips/[id]">
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  // Verify ownership first so we can safely path-derive the clip dir
  const job = await prisma.clipJob.findFirst({
    where: { id, userId: session.id },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json({ success: true });
  }

  // Posts that point at this job's clip files become orphans the moment
  // the on-disk files are removed below. Cancel any still-pending ones
  // and prune the Post rows so the schedule view doesn't keep showing
  // them. We also wipe POSTED rows for this jobId — they're now
  // un-replayable (file is gone) and only clutter the posts page.
  const orphanedPosts = await prisma.post.findMany({
    where: {
      userId: session.id,
      mediaUrl: { startsWith: `/api/uploads/clips/${id}/` },
    },
    select: { id: true, status: true },
  });
  if (orphanedPosts.length > 0) {
    const cancelable = orphanedPosts
      .filter((p) => p.status === "SCHEDULED" || p.status === "QUEUED")
      .map((p) => p.id);
    if (cancelable.length > 0) {
      await prisma.post.updateMany({
        where: { id: { in: cancelable } },
        data: {
          status: "FAILED",
          results: JSON.stringify({
            cancelled: { error: "Source clip job was deleted" },
          }),
        },
      });
    }
    // Delete all Post rows tied to this job — they reference files that
    // are about to vanish, so keeping them in the table only confuses
    // the user (broken thumbnails, ENOENT on retry, etc).
    await prisma.post.deleteMany({
      where: { id: { in: orphanedPosts.map((p) => p.id) } },
    });
  }

  // Cascade delete the DB rows (Clip rows go too via Prisma onDelete: Cascade)
  await prisma.clipJob.delete({ where: { id: job.id } }).catch(() => {});

  // Delete on-disk clip files for this job. Path traversal guard via
  // strict cuid-style id check.
  if (/^[a-z0-9]+$/i.test(id)) {
    const clipsDir = path.join(process.cwd(), ".uploads", "clips", id);
    await rm(clipsDir, { recursive: true, force: true }).catch((err) => {
      console.warn(`[clips DELETE] failed to remove ${clipsDir}:`, err);
    });
  }

  return NextResponse.json({
    success: true,
    orphanedPostsRemoved: orphanedPosts.length,
  });
}
