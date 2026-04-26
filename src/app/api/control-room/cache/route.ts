import { NextRequest, NextResponse } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { cleanupSourceCache } from "@/lib/clipper/youtube";

/**
 * Admin cache management — manually clear caches without waiting for the
 * hourly cleanup tick. Body: { target: "source" | "broll" | "clipper-work" | "all" }.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { target?: string };
  const target = body.target ?? "all";

  const root = path.join(process.cwd(), ".uploads");
  const targets: Record<string, () => Promise<{ removed: number; bytes: number }>> = {
    source: async () => {
      const removed = await cleanupSourceCache();
      return { removed, bytes: 0 };
    },
    broll: async () => clearDir(path.join(root, "broll-cache")),
    "clipper-work": async () => clearDir("/tmp/klone-clipper"),
  };

  const results: Record<string, unknown> = {};
  if (target === "all") {
    for (const [k, fn] of Object.entries(targets)) {
      try {
        results[k] = await fn();
      } catch (err) {
        results[k] = { error: String(err).slice(0, 200) };
      }
    }
  } else if (targets[target]) {
    try {
      results[target] = await targets[target]();
    } catch (err) {
      results[target] = { error: String(err).slice(0, 200) };
    }
  } else {
    return NextResponse.json({ error: "Unknown cache target" }, { status: 400 });
  }

  await logAdminAction({
    adminEmail: admin.email,
    action: "cache.clear",
    targetId: target,
    details: results,
    request,
  });

  return NextResponse.json({ success: true, results });
}

async function clearDir(dir: string): Promise<{ removed: number; bytes: number }> {
  const { readdir, stat } = await import("fs/promises");
  let removed = 0;
  let bytes = 0;
  try {
    const entries = await readdir(dir);
    for (const e of entries) {
      const p = path.join(dir, e);
      try {
        const s = await stat(p);
        bytes += s.size;
      } catch {
        // ignore
      }
      await rm(p, { recursive: true, force: true });
      removed += 1;
    }
  } catch {
    // dir doesn't exist — nothing to do
  }
  return { removed, bytes };
}
