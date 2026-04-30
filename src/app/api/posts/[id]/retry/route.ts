import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVerifiedSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";
import { firePost } from "@/lib/post-runner";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/posts/[id]/retry">
) {
  // Retry hits the same publish path as POST /api/posts — same gate.
  const auth = await getVerifiedSession();
  if (!auth.ok) {
    if (auth.reason === "no_session") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: "Verify your email before retrying posts.",
        reason: "email_not_verified",
      },
      { status: 403 },
    );
  }
  const session = auth.session;

  const rl = enforceRateLimit(request, session.id, "posts:retry", 20);
  if (rl) return rl;

  const { id } = await ctx.params;

  const post = await prisma.post.findFirst({
    where: { id, userId: session.id },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.status !== "FAILED" && post.status !== "PARTIAL") {
    return NextResponse.json(
      { error: "Only FAILED or PARTIAL posts can be retried" },
      { status: 400 }
    );
  }

  // Build a "retry-only-failed" temporary Post: copy the row but set
  // platforms to only those that previously failed. Reuse firePost so
  // status + results land back on the original row.
  let prevResults: Record<string, { error?: string; success?: boolean }> = {};
  try {
    if (post.results) prevResults = JSON.parse(post.results);
  } catch {
    // ignore
  }

  const allRequested = (post.platforms || "").split(",").filter(Boolean);
  const failed = allRequested.filter((p) => prevResults[p]?.error);
  const succeeded = allRequested.filter((p) => prevResults[p]?.success);

  if (failed.length === 0) {
    return NextResponse.json(
      { error: "No failed platforms to retry" },
      { status: 400 }
    );
  }

  await prisma.post.update({
    where: { id: post.id },
    data: { status: "POSTING", platforms: failed.join(",") },
  });

  const refreshed = await prisma.post.findUnique({ where: { id: post.id } });
  if (!refreshed) {
    return NextResponse.json({ error: "Post vanished" }, { status: 500 });
  }

  const result = await firePost(refreshed);

  // Merge new results with old success entries so we don't lose history.
  const mergedResults: Record<string, unknown> = { ...prevResults };
  for (const [platform, r] of Object.entries(result.results)) {
    mergedResults[platform] = r;
  }

  // Recompute overall status from the merged map
  const mergedEntries = Object.values(mergedResults);
  const mergedFails = mergedEntries.filter(
    (r) => r && typeof r === "object" && "error" in (r as object)
  ).length;
  const mergedSuccs = mergedEntries.length - mergedFails;
  const newStatus =
    mergedFails === 0 ? "POSTED" : mergedSuccs === 0 ? "FAILED" : "PARTIAL";

  // Restore the full platforms string and persist merged results
  await prisma.post.update({
    where: { id: post.id },
    data: {
      status: newStatus,
      platforms: allRequested.join(","),
      results: JSON.stringify(mergedResults),
      postedAt:
        newStatus === "FAILED"
          ? null
          : refreshed.postedAt ?? new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    retried: failed,
    skipped: succeeded,
    results: result.results,
  });
}
