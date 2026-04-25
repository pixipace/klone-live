import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids = body?.ids as string[] | undefined;

  // Two modes: cancel ALL scheduled, or just specific IDs
  const where = {
    userId: session.id,
    status: "SCHEDULED",
    ...(Array.isArray(ids) && ids.length > 0 ? { id: { in: ids } } : {}),
  };

  const result = await prisma.post.updateMany({
    where,
    data: {
      status: "FAILED",
      results: JSON.stringify({ cancelled: { error: "Cancelled by user" } }),
    },
  });

  return NextResponse.json({ success: true, cancelled: result.count });
}
