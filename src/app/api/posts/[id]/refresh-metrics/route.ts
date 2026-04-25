import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { fetchMetricsForPost } from "@/lib/platforms/insights";

/**
 * Manually refresh per-platform metrics for a single Post. Hits each
 * connected platform's insights API and persists the merged result on
 * Post.metrics + Post.metricsUpdatedAt. Auth-gated to the post owner.
 */
export async function POST(
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
    select: { id: true, status: true, results: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!["POSTED", "PARTIAL"].includes(post.status)) {
    return NextResponse.json(
      { error: "Post hasn't been published yet — no metrics to fetch" },
      { status: 400 }
    );
  }

  const metrics = await fetchMetricsForPost(post.id, session.id);

  await prisma.post.update({
    where: { id: post.id },
    data: {
      metrics: JSON.stringify(metrics),
      metricsUpdatedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, metrics });
}
