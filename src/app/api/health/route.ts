import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const startedAt = Date.now();

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "error",
        error: String(err),
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
