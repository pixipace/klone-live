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

  return NextResponse.json({ success: true });
}
