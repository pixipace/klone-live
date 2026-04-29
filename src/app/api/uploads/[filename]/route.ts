import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyMediaSignature } from "@/lib/platforms/types";

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/**
 * Serve a flat-filename upload (legacy path before per-user dirs landed).
 * Auth-required + ownership-checked: the requesting user must own a Post
 * whose mediaUrl ends with this filename. Prevents enumeration of other
 * users' media via guessable filenames.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  // Path traversal guard
  if (filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Auth: accept EITHER a valid session (browser) OR a valid signed URL
  // (external platforms — Meta, etc. fetch without cookies). Signed URLs
  // are path-scoped + 1h-expiring so they can't enumerate other media.
  const sigToken = request.nextUrl.searchParams.get("t");
  const expiresAt = parseInt(request.nextUrl.searchParams.get("e") || "0", 10);
  const mediaPath = `/api/uploads/${filename}`;
  const signed = sigToken
    ? verifyMediaSignature(mediaPath, expiresAt, sigToken)
    : false;

  if (!signed) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    // Ownership check: require a Post owned by the session user that
    // references this filename in its mediaUrl.
    const expectedUrl = `/api/uploads/${filename}`;
    const owns = await prisma.post.findFirst({
      where: { userId: session.id, mediaUrl: expectedUrl },
      select: { id: true },
    });
    if (!owns) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const filepath = path.join(process.cwd(), ".uploads", filename);
    const st = await stat(filepath);
    const fileSize = st.size;

    const ext = path.extname(filename).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    // HTTP Range support — Safari/iOS html5 video requires 206 responses
    // or it shows the play button then bails on tap.
    const range = request.headers.get("range");
    if (range) {
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
        // PRIVATE — was public,max-age=year. Now per-user, no shared cache.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
