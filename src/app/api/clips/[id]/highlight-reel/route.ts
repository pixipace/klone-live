import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { stat } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";

/**
 * Generate a highlight reel from the top N clips of a job. Concatenates
 * them with a 0.4s crossfade between each. Auto-picks the highest-virality
 * clips up to ~90 seconds total.
 *
 * Body: { maxDurationSec?: number, clipIds?: string[] }
 *   - maxDurationSec: cap total reel length (default 90s)
 *   - clipIds: optional explicit pick order (otherwise auto-pick by score)
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = enforceRateLimit(request, session.id, "highlight-reel", 10);
  if (rl) return rl;

  const { id: jobId } = await ctx.params;

  const job = await prisma.clipJob.findFirst({
    where: { id: jobId, userId: session.id },
    include: { clips: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const renderedClips = job.clips.filter((c) => c.videoPath !== null);
  if (renderedClips.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 rendered clips for a highlight reel" },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    maxDurationSec?: number;
    clipIds?: string[];
  };
  const maxDur = Math.max(30, Math.min(120, body.maxDurationSec ?? 90));

  // Pick clips: explicit list if provided (in their order), otherwise
  // top-scoring. Either way cap by maxDur cumulative.
  let candidates = renderedClips;
  if (Array.isArray(body.clipIds) && body.clipIds.length > 0) {
    const byId = new Map(renderedClips.map((c) => [c.id, c]));
    candidates = body.clipIds
      .map((id) => byId.get(id))
      .filter((c): c is (typeof renderedClips)[number] => c !== undefined);
  } else {
    candidates = [...renderedClips].sort(
      (a, b) => b.viralityScore - a.viralityScore
    );
  }

  const chosen: typeof renderedClips = [];
  let totalDur = 0;
  for (const c of candidates) {
    if (totalDur + c.durationSec > maxDur && chosen.length > 0) break;
    chosen.push(c);
    totalDur += c.durationSec;
  }
  if (chosen.length < 2) {
    return NextResponse.json(
      { error: "Could not assemble enough clips within duration cap" },
      { status: 400 }
    );
  }

  // Resolve on-disk paths
  const inputPaths: string[] = [];
  for (const c of chosen) {
    if (!c.videoPath) continue;
    const m = c.videoPath.match(/\/clips\/([^/]+)\/(.+)$/);
    if (!m) continue;
    const p = path.join(process.cwd(), ".uploads", "clips", m[1], m[2]);
    try {
      await stat(p);
      inputPaths.push(p);
    } catch {
      // skip missing files
    }
  }
  if (inputPaths.length < 2) {
    return NextResponse.json(
      { error: "Some clip files are missing on disk — re-pick may have wiped them" },
      { status: 400 }
    );
  }

  const outDir = path.join(process.cwd(), ".uploads", "clips", jobId);
  const reelPath = path.join(outDir, "highlight-reel.mp4");
  const thumbPath = path.join(outDir, "highlight-reel.jpg");

  // Build ffmpeg concat with xfade transitions. Each input is loaded,
  // probed for duration, then crossfaded to the next using xfade filter
  // with offset = (cumulative_duration - 0.4s) per transition.
  const TRANSITION = 0.4;

  // Probe durations
  const durations: number[] = [];
  for (const p of inputPaths) {
    const d = await new Promise<number>((resolve) => {
      const child = spawn("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        p,
      ]);
      let out = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.on("close", () => resolve(parseFloat(out.trim()) || 0));
      child.on("error", () => resolve(0));
    });
    durations.push(d);
  }

  // Build filter graph
  const inputArgs: string[] = [];
  for (const p of inputPaths) inputArgs.push("-i", p);

  // Video xfade chain
  // [0:v][1:v] xfade=offset=(d0-T) → [vx0]; [vx0][2:v] xfade=offset=(d0+d1-2T) ...
  const vfParts: string[] = [];
  let offset = 0;
  let lastV = "0:v";
  for (let i = 1; i < inputPaths.length; i++) {
    offset += durations[i - 1] - TRANSITION;
    const out = i === inputPaths.length - 1 ? "vout" : `vx${i}`;
    vfParts.push(
      `[${lastV}][${i}:v]xfade=transition=fade:duration=${TRANSITION.toFixed(2)}:offset=${offset.toFixed(3)}[${out}]`
    );
    lastV = out;
  }

  // Audio acrossfade chain — same offset math
  const afParts: string[] = [];
  let lastA = "0:a";
  for (let i = 1; i < inputPaths.length; i++) {
    const out = i === inputPaths.length - 1 ? "aout" : `ax${i}`;
    afParts.push(
      `[${lastA}][${i}:a]acrossfade=d=${TRANSITION.toFixed(2)}[${out}]`
    );
    lastA = out;
  }

  const filterComplex = [...vfParts, ...afParts].join(";");

  const args = [
    "-y",
    ...inputArgs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "21",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    reelPath,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", args);
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))
      );
      child.on("error", reject);
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Reel generation failed: ${String(err).slice(0, 300)}` },
      { status: 500 }
    );
  }

  // Thumbnail from middle of the reel
  const totalReelDur = durations.reduce((a, b) => a + b, 0) - TRANSITION * (inputPaths.length - 1);
  await new Promise<void>((resolve) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-ss", (totalReelDur / 2).toFixed(2),
      "-i", reelPath,
      "-vframes", "1",
      "-q:v", "3",
      thumbPath,
    ]);
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });

  // Pick the highest-scoring clip's hook as the reel hook by default
  const topClip = chosen.reduce((a, b) =>
    a.viralityScore >= b.viralityScore ? a : b
  );

  await prisma.clipJob.update({
    where: { id: jobId },
    data: {
      highlightReelPath: `/api/uploads/clips/${jobId}/highlight-reel.mp4`,
      highlightReelThumb: `/api/uploads/clips/${jobId}/highlight-reel.jpg`,
      highlightReelHook: topClip.hookTitle,
    },
  });

  return NextResponse.json({
    success: true,
    clipsUsed: chosen.length,
    durationSec: Number(totalReelDur.toFixed(1)),
    reelPath: `/api/uploads/clips/${jobId}/highlight-reel.mp4`,
  });
}
