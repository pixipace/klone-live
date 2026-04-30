import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { PlatformId } from "@/lib/constants";

/**
 * Single-query "which platforms is this user connected to?" endpoint.
 * Used everywhere the UI needs to gate platform selection (create page,
 * clipper publishing prefs, per-clip auto-distribute) so unconnected
 * platforms can be visibly disabled instead of silently failing later.
 *
 * Meta is a single OAuth that grants BOTH facebook + instagram. We
 * unpack the meta JSON to determine which sub-platforms actually have
 * active selections — a Meta connection without an IG subaccount link
 * shouldn't unlock "Instagram" in the picker.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: session.id },
    select: { platform: true, meta: true },
  });

  const connected: PlatformId[] = [];
  for (const a of accounts) {
    const platform = a.platform as PlatformId;
    if (platform === "facebook") {
      // Meta OAuth — figure out which of FB/IG are actually selectable
      // based on the meta JSON contents (pages list + ig accounts list).
      let meta: { pages?: unknown[]; igAccounts?: unknown[] } = {};
      try {
        meta = a.meta ? JSON.parse(a.meta) : {};
      } catch {
        // malformed meta — treat as no sub-accounts
      }
      if (Array.isArray(meta.pages) && meta.pages.length > 0) {
        connected.push("facebook");
      }
      if (Array.isArray(meta.igAccounts) && meta.igAccounts.length > 0) {
        connected.push("instagram");
      }
    } else if (platform === "tiktok" || platform === "linkedin" || platform === "youtube") {
      connected.push(platform);
    }
  }

  return NextResponse.json({ connected });
}
