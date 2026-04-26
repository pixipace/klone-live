import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { requireAdmin } from "@/lib/auth";

const SERVER_LOG = "/tmp/klone-server.log";
const ERROR_LOG = "/tmp/klone-server-error.log";

/**
 * Tail the server logs for live debugging. ?source=stdout|stderr.
 * Returns last N lines (default 200, max 1000). Auth-gated to OWNER.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const source = url.searchParams.get("source") === "stderr" ? ERROR_LOG : SERVER_LOG;
  const lines = Math.min(
    1000,
    Math.max(10, parseInt(url.searchParams.get("lines") ?? "200", 10) || 200)
  );

  try {
    const s = await stat(source);
    // For very large logs, read only the last ~256KB to keep memory bounded.
    // The tail-by-line slice below is exact.
    const MAX_BYTES = 256 * 1024;
    let raw: string;
    if (s.size > MAX_BYTES) {
      const fd = await import("fs/promises").then((m) => m.open(source, "r"));
      try {
        const buf = Buffer.alloc(MAX_BYTES);
        await fd.read(buf, 0, MAX_BYTES, s.size - MAX_BYTES);
        raw = buf.toString("utf8");
      } finally {
        await fd.close();
      }
    } else {
      raw = await readFile(source, "utf8");
    }

    const allLines = raw.split("\n");
    const tail = allLines.slice(-lines).join("\n");

    return new NextResponse(tail, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not read log: ${String(err).slice(0, 200)}`,
      },
      { status: 500 }
    );
  }
}
