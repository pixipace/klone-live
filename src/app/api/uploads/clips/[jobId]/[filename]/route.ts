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
 */
export async function GET(
  _request: NextRequest,
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
    await stat(filepath);
    const buffer = await readFile(filepath);

    const ext = path.extname(filename).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
