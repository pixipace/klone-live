import { NextResponse } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession, deleteSession } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Find all this user's clip jobs so we can wipe their on-disk dirs.
  const jobs = await prisma.clipJob.findMany({
    where: { userId: session.id },
    select: { id: true },
  });

  for (const j of jobs) {
    if (/^[a-z0-9]+$/i.test(j.id)) {
      const dir = path.join(process.cwd(), ".uploads", "clips", j.id);
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Delete the user — cascades clean SocialAccount, Post, ClipJob, Clip
  // (all have @relation onDelete: Cascade)
  await prisma.user
    .delete({ where: { id: session.id } })
    .catch((err) => console.error("[account delete] prisma delete failed:", err));

  await deleteSession();

  return NextResponse.json({ success: true });
}
