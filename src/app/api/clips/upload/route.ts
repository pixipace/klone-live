import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, stat } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB
const MAX_SOURCE_SEC = 3 * 60 * 60; // 3 hours (matches /api/clips)
const SOURCE_ROOT = path.join(process.cwd(), ".uploads", "clipper-sources");

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`));
      const sec = parseFloat(out.trim());
      Number.isFinite(sec) && sec > 0
        ? resolve(sec)
        : reject(new Error("Could not read duration"));
    });
    child.on("error", reject);
  });
}

/**
 * Accept a multipart .mp4 (or other ffmpeg-readable video) upload and
 * create a clip job for it. Skips yt-dlp by encoding the on-disk path
 * into the sourceUrl as `upload://...?dur=NN&title=...` — the pipeline's
 * downloadYouTube() detects the upload:// scheme and copies the file
 * into the work dir instead of running yt-dlp.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const inflight = await prisma.clipJob.count({
    where: {
      userId: session.id,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (inflight >= 2) {
    return NextResponse.json(
      { error: "You already have 2 jobs running. Wait for them to finish." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Bad multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (${Math.round(file.size / 1024 / 1024)} MB). Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Use a YouTube URL for longer videos.`,
      },
      { status: 413 }
    );
  }

  // Save to .uploads/clipper-sources/{user-id}/{hash}.mp4
  const userDir = path.join(SOURCE_ROOT, session.id);
  await mkdir(userDir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.mp4`;
  const onDisk = path.join(userDir, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(onDisk, buf);

  // Probe duration server-side
  let durationSec = 0;
  try {
    durationSec = await probeDuration(onDisk);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read video metadata: ${String(err).slice(0, 200)}` },
      { status: 400 }
    );
  }
  if (durationSec > MAX_SOURCE_SEC) {
    return NextResponse.json(
      {
        error: `Video is ${Math.round(durationSec / 60)} min. Max is ${MAX_SOURCE_SEC / 60} min.`,
      },
      { status: 400 }
    );
  }

  // Pull toggles + guidance from form fields (sent as strings)
  const captions = formData.get("captions") !== "false";
  const music = formData.get("music") !== "false";
  const punchZooms = formData.get("punchZooms") !== "false";
  const broll = formData.get("broll") === "true";
  const translateCaptions = formData.get("translateCaptions") === "true";
  const guidanceRaw = formData.get("guidance");
  const guidance =
    typeof guidanceRaw === "string" && guidanceRaw.trim().length > 0
      ? guidanceRaw.trim().slice(0, 500)
      : null;

  // Derive a display title from the original filename
  const displayTitle = file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Uploaded video";

  // Build the upload:// sourceUrl with duration + title encoded
  const sourceUrl = `upload://${session.id}/${filename}?dur=${durationSec.toFixed(2)}&title=${encodeURIComponent(displayTitle)}`;

  const job = await prisma.clipJob.create({
    data: {
      userId: session.id,
      sourceUrl,
      sourceTitle: displayTitle,
      sourceDuration: Math.round(durationSec),
      status: "QUEUED",
      optCaptions: captions,
      optMusic: music,
      optPunchZooms: punchZooms,
      optBroll: broll,
      optTranslateCaptions: translateCaptions,
      pickerGuidance: guidance,
    },
  });

  // Sanity-check the file persisted (writeFile already awaited but doesn't
  // hurt — caught issues during dev where macOS quarantine ate uploads)
  try {
    await stat(onDisk);
  } catch {
    return NextResponse.json(
      { error: "Upload saved but file missing on stat — disk full?" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    jobId: job.id,
    status: "QUEUED",
    sourceTitle: displayTitle,
    sourceDuration: Math.round(durationSec),
  });
}
