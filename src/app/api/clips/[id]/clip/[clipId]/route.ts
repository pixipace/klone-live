import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/clips/[id]/clip/[clipId]">
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = enforceRateLimit(request, session.id, "clip:patch", 30);
  if (rl) return rl;

  const { id: jobId, clipId } = await ctx.params;

  const job = await prisma.clipJob.findFirst({
    where: { id: jobId, userId: session.id },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const { hookTitle } = body as { hookTitle?: string };

  if (typeof hookTitle !== "string" || hookTitle.length === 0) {
    return NextResponse.json({ error: "Invalid hookTitle" }, { status: 400 });
  }

  await prisma.clip.update({
    where: { id: clipId, jobId } as { id: string; jobId: string },
    data: { hookTitle: hookTitle.slice(0, 200) },
  });

  return NextResponse.json({ success: true });
}
