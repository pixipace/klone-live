import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";
import { generateCaptionVariants } from "@/lib/ai";

/**
 * Regenerate three fresh hook variants for an existing clip without
 * touching the rendered video file. Uses the clip's stored transcript +
 * Gemma to spit out new options. The returned variants overwrite the
 * clip's hookVariants (the existing hookTitle stays selected unless the
 * user picks a new one via the variant picker UI).
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; clipId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = enforceRateLimit(request, session.id, "hook:regen", 20);
  if (rl) return rl;

  const { id: jobId, clipId } = await ctx.params;

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, jobId, job: { userId: session.id } },
    include: { job: true },
  });
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }
  if (!clip.transcript || clip.transcript.trim().length < 20) {
    return NextResponse.json(
      { error: "No transcript on this clip — can't regenerate" },
      { status: 400 }
    );
  }

  let variants: string[] = [];
  try {
    // Use the caption-variants helper (already prompts for distinct hook
    // angles per variant). Treat the clip as if posting to TikTok format
    // since the constraints (short, hook-driven) match a clip hook.
    variants = await generateCaptionVariants(
      clip.transcript.slice(0, 1000),
      "tiktok",
      "punchy",
      3
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Gemma failed: ${String(err).slice(0, 200)}` },
      { status: 500 }
    );
  }

  const cleaned = variants
    .map((v) => v.trim().replace(/^["']|["']$/g, "").slice(0, 200))
    .filter((v) => v.length > 0);
  if (cleaned.length === 0) {
    return NextResponse.json(
      { error: "Gemma returned no usable variants — try again" },
      { status: 500 }
    );
  }

  await prisma.clip.update({
    where: { id: clipId },
    data: { hookVariants: JSON.stringify(cleaned) },
  });

  return NextResponse.json({ success: true, variants: cleaned });
}
