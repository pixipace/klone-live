import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

/**
 * Serve clip media at .uploads/clips/{jobId}/{filename}. Auth + ownership
 * required: session user must own the ClipJob the file belongs to.
 *
 * Implements HTTP Range responses (206 Partial Content) — Safari / iOS
 * require these for HTML5 video, otherwise the player loads, shows the
 * play button, and silently bails out when click-to-play tries to seek.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string; filename: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { jobId, filename } = await context.params;

  if (
    jobId.includes("..") ||
    jobId.includes("/") ||
    filename.includes("..") ||
    filename.includes("/")
  ) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Ownership check: ClipJob must belong to session user
  const job = await prisma.clipJob.findFirst({
    where: { id: jobId, userId: session.id },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const filepath = path.join(process.cwd(), ".uploads", "clips", jobId, filename);
    const st = await stat(filepath);
    const fileSize = st.size;

    const ext = path.extname(filename).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    const range = request.headers.get("range");
    if (range) {
      // "bytes=START-END" (END optional). When the browser sends an
      // open-ended request like "bytes=0-", we cap each chunk at 1MB
      // — Safari/Chrome both expect progressive Range responses, NOT
      // the entire file in one 206 (they time out on large mid-stream
      // dumps). Browser will re-request more chunks as it plays.
      const m = /bytes=(\d+)-(\d+)?/.exec(range);
      if (m) {
        const MAX_CHUNK = 1024 * 1024; // 1MB per Range response
        const start = Math.min(parseInt(m[1], 10), fileSize - 1);
        const requestedEnd = m[2] ? parseInt(m[2], 10) : fileSize - 1;
        const end = Math.min(requestedEnd, start + MAX_CHUNK - 1, fileSize - 1);
        if (start <= end) {
          const buf = await readFile(filepath);
          const chunk = buf.subarray(start, end + 1);
          return new NextResponse(chunk as unknown as BodyInit, {
            status: 206,
            headers: {
              "Content-Type": contentType,
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(chunk.length),
              "Cache-Control": "private, max-age=300",
            },
          });
        }
      }
    }

    const buffer = await readFile(filepath);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(fileSize),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
