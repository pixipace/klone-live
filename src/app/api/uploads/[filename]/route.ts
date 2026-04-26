import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { filename } = await context.params;

  // Path traversal guard
  if (filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
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

  try {
    const filepath = path.join(process.cwd(), ".uploads", filename);
    await stat(filepath);
    const buffer = await readFile(filepath);

    const ext = path.extname(filename).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        // PRIVATE — was public,max-age=year. Now per-user, no shared cache.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
