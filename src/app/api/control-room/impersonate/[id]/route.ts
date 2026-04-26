import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdmin, createSession } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";

/**
 * Start impersonating another user from /control-room.
 *
 * Sets two cookies:
 *   - `session` — replaces the admin's session with the target user's
 *   - `klone_imp_origin` — stash the admin's email so they can "stop
 *     impersonating" and return to their own account
 *
 * Banner on every page reads klone_imp_origin and renders the
 * "Impersonating X — exit impersonation" warning. Endpoint /api/control-room/impersonate/exit
 * undoes both cookies.
 *
 * Audit-logged. Admin can NEVER impersonate themselves or another admin.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (id === admin.id) {
    return NextResponse.json(
      { error: "You're already yourself." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, plan: true, credits: true, banned: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.banned) {
    return NextResponse.json(
      { error: "Cannot impersonate a banned user — unban first." },
      { status: 400 }
    );
  }

  // Replace session
  await createSession({
    id: target.id,
    email: target.email,
    name: target.name ?? "",
    plan: target.plan,
    credits: target.credits,
  });

  // Marker cookie — read by the impersonation banner. Stores admin's
  // email so they can return + telemetry can show what they were doing.
  (await cookies()).set("klone_imp_origin", admin.email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours max — re-impersonate after that
    path: "/",
  });

  await logAdminAction({
    adminEmail: admin.email,
    action: "user.impersonate.start",
    targetId: id,
    details: { targetEmail: target.email },
    request,
  });

  return NextResponse.json({ success: true, redirectTo: "/dashboard" });
}
