import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { generateCaptionFromImage, isOllamaUp } from "@/lib/ai";

const PLATFORMS = ["tiktok", "facebook", "instagram", "linkedin", "youtube"] as const;
type Platform = (typeof PLATFORMS)[number];

function isPlatform(p: unknown): p is Platform {
  return typeof p === "string" && (PLATFORMS as readonly string[]).includes(p);
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await isOllamaUp())) {
    return NextResponse.json(
      { error: "AI unavailable — Ollama not running" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { mediaUrl, mediaType, platform, tone, context } = body as {
    mediaUrl?: string;
    mediaType?: string;
    platform?: string;
    tone?: string;
    context?: string;
  };

  if (!isPlatform(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
  if (!mediaUrl || !mediaUrl.startsWith("/api/uploads/")) {
    return NextResponse.json({ error: "Missing or invalid mediaUrl" }, { status: 400 });
  }
  if (mediaType !== "image") {
    return NextResponse.json(
      { error: "Video captioning is coming with WhatsApp voice support. For now, use the text Generate or Rewrite buttons." },
      { status: 400 }
    );
  }

  const filename = mediaUrl.replace("/api/uploads/", "");
  if (filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  const filePath = path.join(process.cwd(), ".uploads", filename);

  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Image too large (>${MAX_IMAGE_BYTES / 1024 / 1024} MB) for AI processing` },
      { status: 400 }
    );
  }

  try {
    const caption = await generateCaptionFromImage(
      buffer.toString("base64"),
      platform,
      tone || "friendly",
      context
    );
    return NextResponse.json({ caption });
  } catch (err) {
    console.error("AI image caption error:", err);
    return NextResponse.json(
      { error: `AI failed: ${String(err)}` },
      { status: 500 }
    );
  }
}
