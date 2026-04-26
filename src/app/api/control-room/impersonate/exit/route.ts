import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession, createSession } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";

/**
 * Exit impersonation: read klone_imp_origin cookie, restore that admin's
 * session, clear the marker. No requireAdmin() because the CURRENT
 * session is the impersonated user — auth comes from the marker cookie.
 */
export async function POST(request: NextRequest) {
  const c = await cookies();
  const adminEmail = c.get("klone_imp_origin")?.value;
  if (!adminEmail) {
    return NextResponse.json(
      { error: "Not impersonating anyone." },
      { status: 400 }
    );
  }

  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
  if (!ownerEmail || adminEmail.toLowerCase() !== ownerEmail) {
    // Marker cookie doesn't match the configured owner — bail.
    c.delete("klone_imp_origin");
    return NextResponse.json(
      { error: "Origin admin no longer authorized." },
      { status: 403 }
    );
  }

  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, email: true, name: true, plan: true, credits: true },
  });
  if (!adminUser) {
    c.delete("klone_imp_origin");
    return NextResponse.json(
      { error: "Origin admin user not found." },
      { status: 404 }
    );
  }

  const impersonated = await getSession();
  await createSession({
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name ?? "",
    plan: adminUser.plan,
    credits: adminUser.credits,
  });
  c.delete("klone_imp_origin");

  await logAdminAction({
    adminEmail: adminEmail,
    action: "user.impersonate.stop",
    targetId: impersonated?.id ?? null,
    request,
  });

  return NextResponse.json({ success: true, redirectTo: "/control-room" });
}
