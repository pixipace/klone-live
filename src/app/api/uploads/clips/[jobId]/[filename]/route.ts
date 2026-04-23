import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/uploads/clips/[jobId]/[filename]">
) {
  try {
    const { jobId, filename } = await context.params;

    if (
      jobId.includes("..") ||
      jobId.includes("/") ||
      filename.includes("..") ||
      filename.includes("/")
    ) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const filepath = path.join(process.cwd(), ".uploads", "clips", jobId, filename);
    await stat(filepath);
    const buffer = await readFile(filepath);

    const ext = path.extname(filename).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
