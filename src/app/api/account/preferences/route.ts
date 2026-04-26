import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = enforceRateLimit(request, session.id, "account:prefs", 30);
  if (rl) return rl;

  const body = await request.json();
  const data: {
    notifyOnPost?: boolean;
    audienceTimezone?: string | null;
    weeklyDigestEnabled?: boolean;
  } = {};

  if (typeof body.notifyOnPost === "boolean") {
    data.notifyOnPost = body.notifyOnPost;
  }
  if (typeof body.audienceTimezone === "string" || body.audienceTimezone === null) {
    data.audienceTimezone = body.audienceTimezone;
  }
  if (typeof body.weeklyDigestEnabled === "boolean") {
    data.weeklyDigestEnabled = body.weeklyDigestEnabled;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: session.id }, data });
  return NextResponse.json({ success: true });
}
