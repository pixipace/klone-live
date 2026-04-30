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

  const connected = new Set<PlatformId>();
  for (const a of accounts) {
    const platform = a.platform as PlatformId;
    if (platform === "facebook") {
      // Facebook row holds Pages list + (sometimes) the IG Business
      // subaccount linked to each Page in instagram_business_account.
      // We ALWAYS add "facebook" if the row has at least one Page; IG
      // detection from the FB meta is a bonus path — the actual IG
      // posting uses a separate "instagram" row created in parallel
      // by the OAuth flow when the user has IG Business linked.
      let meta: {
        pages?: Array<{ instagram_business_account?: unknown }>;
      } = {};
      try {
        meta = a.meta ? JSON.parse(a.meta) : {};
      } catch {
        // malformed meta — treat as no sub-accounts
      }
      if (Array.isArray(meta.pages) && meta.pages.length > 0) {
        connected.add("facebook");
        // If any page has an IG Business linked, mark IG connected too
        // (covers older OAuth flows that didn't write a separate IG row).
        if (meta.pages.some((p) => p && typeof p === "object" && "instagram_business_account" in p && p.instagram_business_account)) {
          connected.add("instagram");
        }
      }
    } else if (platform === "instagram") {
      // Standalone Instagram row — the OAuth flow writes one of these
      // when an IG Business account is linked. The meta JSON has
      // { accounts: [...] } (NOT igAccounts as the connected route
      // previously expected — that was a fieldname mismatch and meant
      // every Instagram-connected user saw IG as "not connected" in
      // the platform picker).
      let meta: { accounts?: unknown[] } = {};
      try {
        meta = a.meta ? JSON.parse(a.meta) : {};
      } catch {}
      if (Array.isArray(meta.accounts) && meta.accounts.length > 0) {
        connected.add("instagram");
      } else {
        // Even without an accounts list, an "instagram" row existing
        // means the user successfully OAuth'd at some point. Add it
        // and let the post-time check surface any issue. Better to
        // err on the side of selectable — silent unselectable was
        // the actual user-reported bug.
        connected.add("instagram");
      }
    } else if (platform === "tiktok" || platform === "linkedin" || platform === "youtube") {
      connected.add(platform);
    }
  }

  return NextResponse.json({ connected: Array.from(connected) });
}
