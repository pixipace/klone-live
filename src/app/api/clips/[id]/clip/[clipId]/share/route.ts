import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";

/**
 * Toggle the public-share flag on a clip the session user owns.
 * Body: { enabled: boolean }. PATCH because it mutates the existing clip.
 *
 * When enabled=true, the clip becomes viewable at klone.live/c/{clipId}
 * + its media is served by the public-clips file route. Toggle back to
 * false to revoke instantly (file route re-checks the flag every request).
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; clipId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = enforceRateLimit(request, session.id, "clip:share", 30);
  if (rl) return rl;

  const { id: jobId, clipId } = await ctx.params;

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, jobId, job: { userId: session.id } },
    select: { id: true, videoPath: true },
  });
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }
  if (!clip.videoPath) {
    return NextResponse.json(
      { error: "Clip not yet rendered — try again once the job finishes" },
      { status: 400 }
    );
  }

  const body = (await request.json()) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be true or false" },
      { status: 400 }
    );
  }

  await prisma.clip.update({
    where: { id: clipId },
    data: { publicShareEnabled: body.enabled },
  });

  return NextResponse.json({
    success: true,
    enabled: body.enabled,
    shareUrl: body.enabled
      ? `${process.env.NEXTAUTH_URL || "https://klone.live"}/c/${clipId}`
      : null,
  });
}
