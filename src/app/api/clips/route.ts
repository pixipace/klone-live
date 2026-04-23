import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const YT_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const jobs = await prisma.clipJob.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      _count: { select: { clips: true } },
    },
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { sourceUrl } = body as { sourceUrl?: string };

  if (!sourceUrl || typeof sourceUrl !== "string") {
    return NextResponse.json({ error: "Missing sourceUrl" }, { status: 400 });
  }
  if (!YT_RE.test(sourceUrl)) {
    return NextResponse.json(
      { error: "Only YouTube URLs supported for now" },
      { status: 400 }
    );
  }

  const inflight = await prisma.clipJob.count({
    where: {
      userId: session.id,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (inflight >= 2) {
    return NextResponse.json(
      { error: "You already have 2 jobs running. Wait for them to finish." },
      { status: 429 }
    );
  }

  const job = await prisma.clipJob.create({
    data: {
      userId: session.id,
      sourceUrl: sourceUrl.trim(),
      status: "QUEUED",
    },
  });

  return NextResponse.json({ jobId: job.id, status: "QUEUED" });
}
