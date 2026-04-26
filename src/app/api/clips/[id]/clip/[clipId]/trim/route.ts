import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { rename, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";

/**
 * Trim an already-rendered clip down (can't extend — source is gone).
 * Body: { trimStartSec: number, trimEndSec: number } in CLIP-LOCAL seconds.
 *   - trimStartSec = how many seconds to chop off the start (default 0)
 *   - trimEndSec   = how many seconds to chop off the end (default 0)
 * The remaining middle becomes the new clip. Re-encode with libx264 since
 * we can't `-c copy` after a non-keyframe -ss without artifacts.
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; clipId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = enforceRateLimit(request, session.id, "clips:trim", 20);
  if (rl) return rl;

  const { id: jobId, clipId } = await ctx.params;

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, jobId, job: { userId: session.id } },
  });
  if (!clip || !clip.videoPath) {
    return NextResponse.json(
      { error: "Clip not found or not yet rendered" },
      { status: 404 }
    );
  }

  const body = (await request.json()) as {
    trimStartSec?: number;
    trimEndSec?: number;
  };
  const trimStart = Math.max(0, Number(body.trimStartSec ?? 0));
  const trimEnd = Math.max(0, Number(body.trimEndSec ?? 0));
  if (!Number.isFinite(trimStart) || !Number.isFinite(trimEnd)) {
    return NextResponse.json({ error: "Invalid trim values" }, { status: 400 });
  }

  const newDur = clip.durationSec - trimStart - trimEnd;
  if (newDur < 5) {
    return NextResponse.json(
      { error: "Resulting clip would be < 5 seconds — pick smaller trims" },
      { status: 400 }
    );
  }

  // Resolve on-disk paths from the served paths
  // videoPath is "/api/uploads/clips/{jobId}/{filename}"
  const m = clip.videoPath.match(/\/clips\/([^/]+)\/(.+)$/);
  if (!m) {
    return NextResponse.json({ error: "Bad videoPath format" }, { status: 500 });
  }
  const dirJobId = m[1];
  const filename = m[2];
  const onDiskPath = path.join(process.cwd(), ".uploads", "clips", dirJobId, filename);

  try {
    await stat(onDiskPath);
  } catch {
    return NextResponse.json(
      { error: "Source clip file missing on disk" },
      { status: 404 }
    );
  }

  const trimmedPath = onDiskPath.replace(/\.mp4$/, ".trimmed.mp4");

  // Re-encode the trimmed range. -ss before -i is fast (input seek) but
  // can land on a non-keyframe and corrupt; placing -ss AFTER -i forces a
  // decode-then-seek. Slower but pixel-accurate. Worth it for trim.
  const ffmpegArgs = [
    "-y",
    "-i",
    onDiskPath,
    "-ss",
    trimStart.toFixed(2),
    "-t",
    newDur.toFixed(2),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    trimmedPath,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", ffmpegArgs);
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`))
      );
      child.on("error", reject);
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Trim failed: ${String(err).slice(0, 200)}` },
      { status: 500 }
    );
  }

  // Replace the original file
  await rename(trimmedPath, onDiskPath);

  await prisma.clip.update({
    where: { id: clipId },
    data: {
      durationSec: newDur,
      // startSec/endSec describe the SOURCE-relative range — leave alone
      // even though the rendered clip is now shorter (cropping internal
      // window of the source).
    },
  });

  return NextResponse.json({
    success: true,
    newDuration: newDur,
    trimStartSec: trimStart,
    trimEndSec: trimEnd,
  });
}
