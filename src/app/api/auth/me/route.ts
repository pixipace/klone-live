import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  // Fetch live verification state from DB. We don't bake emailVerified
  // into the JWT because verification can happen mid-session and we
  // want the banner to disappear on next refresh without forcing logout.
  const fresh = await prisma.user.findUnique({
    where: { id: session.id },
    select: { emailVerified: true },
  });
  return NextResponse.json({
    user: {
      ...session,
      emailVerified: !!fresh?.emailVerified,
    },
  });
}
