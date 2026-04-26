import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

/**
 * Public, no-auth file serve for clips with publicShareEnabled=true.
 * Used by the /c/[id] showcase pages so the video + thumbnail render
 * without requiring a session. Re-checks the flag on every request so
 * revoking visibility is instant.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ clipId: string; filename: string }> }
) {
  const { clipId, filename } = await context.params;

  if (
    clipId.includes("..") ||
    clipId.includes("/") ||
    filename.includes("..") ||
    filename.includes("/")
  ) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Look up the clip to (a) confirm it's public-share enabled and
  // (b) find the actual jobId path the file lives under
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, publicShareEnabled: true },
    select: { id: true, jobId: true, videoPath: true, thumbnailPath: true },
  });
  if (!clip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate the requested filename matches the clip's actual files
  // (don't let people probe arbitrary filenames inside the jobId dir)
  const allowedFilenames = new Set<string>();
  if (clip.videoPath) {
    const m = clip.videoPath.match(/\/([^/]+)$/);
    if (m) allowedFilenames.add(m[1]);
  }
  if (clip.thumbnailPath) {
    const m = clip.thumbnailPath.match(/\/([^/]+)$/);
    if (m) allowedFilenames.add(m[1]);
  }
  if (!allowedFilenames.has(filename)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const filepath = path.join(
      process.cwd(),
      ".uploads",
      "clips",
      clip.jobId,
      filename
    );
    await stat(filepath);
    const buffer = await readFile(filepath);

    const ext = path.extname(filename).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        // Public cache OK — the public flag toggle would invalidate by
        // changing the URL... actually it doesn't. Keep cache short so
        // revoking visibility takes effect within minutes for visitors
        // who already loaded the page.
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
