import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * Owner-only endpoint to verify Sentry is wired up. Throws an error
 * that should appear in the Sentry dashboard within ~30s.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  throw new Error("[Sentry test error] If you see this in Sentry, it works ✓");
}
