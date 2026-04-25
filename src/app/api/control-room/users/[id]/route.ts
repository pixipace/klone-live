import { NextRequest, NextResponse } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const VALID_PLANS = new Set(["FREE", "PRO", "AGENCY"]);

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/control-room/users/[id]">
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await request.json();
  const action = body.action as string;

  // Block admin from de-admining themselves (so the system always has at
  // least one admin path)
  if (admin.id === id && (action === "demote" || action === "ban")) {
    return NextResponse.json(
      { error: "Can't demote or ban yourself" },
      { status: 400 }
    );
  }

  switch (action) {
    case "setPlan": {
      const plan = String(body.plan || "");
      if (!VALID_PLANS.has(plan)) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
      await prisma.user.update({ where: { id }, data: { plan } });
      return NextResponse.json({ success: true });
    }
    case "promote":
      await prisma.user.update({ where: { id }, data: { role: "ADMIN" } });
      return NextResponse.json({ success: true });
    case "demote":
      await prisma.user.update({ where: { id }, data: { role: "USER" } });
      return NextResponse.json({ success: true });
    case "ban":
      await prisma.user.update({ where: { id }, data: { banned: true } });
      return NextResponse.json({ success: true });
    case "unban":
      await prisma.user.update({ where: { id }, data: { banned: false } });
      return NextResponse.json({ success: true });
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/control-room/users/[id]">
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (admin.id === id) {
    return NextResponse.json(
      { error: "Can't delete yourself" },
      { status: 400 }
    );
  }

  // Wipe clip files for this user
  const jobs = await prisma.clipJob.findMany({
    where: { userId: id },
    select: { id: true },
  });
  for (const j of jobs) {
    if (/^[a-z0-9]+$/i.test(j.id)) {
      const dir = path.join(process.cwd(), ".uploads", "clips", j.id);
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
