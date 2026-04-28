import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";

/**
 * Manage the user's F5-TTS voice reference clip — a 5-15 second WAV/MP3
 * whose prosody is mimicked when generating explainer narration.
 *
 * GET    — return whether one is set + its transcript
 * POST   — upload (multipart: audio + text). Replaces any existing.
 * DELETE — clear it (fall back to F5-TTS default narrator voice)
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — plenty for 15s of audio
const ALLOWED_MIME = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
]);

function userVoicePath(userId: string, ext: string): string {
  return path.join(process.cwd(), ".uploads", "voices", `${userId}${ext}`);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { f5RefAudioPath: true, f5RefAudioText: true },
  });
  return NextResponse.json({
    hasReference: !!user?.f5RefAudioPath,
    text: user?.f5RefAudioText ?? "",
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const rl = enforceRateLimit(request, session.id, "user:voice-ref", 10);
  if (rl) return rl;

  const fd = await request.formData();
  const file = fd.get("audio");
  const text = fd.get("text");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }
  if (typeof text !== "string" || text.trim().length < 3) {
    return NextResponse.json(
      { error: "Missing transcript (what's said in the clip)" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio file > 5MB" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `Audio type ${file.type} not supported (use WAV / MP3 / M4A)` },
      { status: 400 },
    );
  }

  // Store as user's-id + extension. One reference per user (replaces).
  const ext = file.type.includes("mp3") || file.type.includes("mpeg")
    ? ".mp3"
    : file.type.includes("m4a") || file.type.includes("mp4")
      ? ".m4a"
      : ".wav";
  const dir = path.join(process.cwd(), ".uploads", "voices");
  await mkdir(dir, { recursive: true });

  // Remove old file if extension differs (avoid orphans)
  const existing = await prisma.user.findUnique({
    where: { id: session.id },
    select: { f5RefAudioPath: true },
  });
  if (existing?.f5RefAudioPath && !existing.f5RefAudioPath.endsWith(ext)) {
    await unlink(existing.f5RefAudioPath).catch(() => {});
  }

  const outPath = userVoicePath(session.id, ext);
  await writeFile(outPath, Buffer.from(await file.arrayBuffer()));

  await prisma.user.update({
    where: { id: session.id },
    data: {
      f5RefAudioPath: outPath,
      f5RefAudioText: text.trim().slice(0, 500),
    },
  });

  return NextResponse.json({
    success: true,
    hasReference: true,
    text: text.trim().slice(0, 500),
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { f5RefAudioPath: true },
  });
  if (user?.f5RefAudioPath) {
    await unlink(user.f5RefAudioPath).catch(() => {});
  }
  await prisma.user.update({
    where: { id: session.id },
    data: { f5RefAudioPath: null, f5RefAudioText: null },
  });

  return NextResponse.json({ success: true, hasReference: false });
}
