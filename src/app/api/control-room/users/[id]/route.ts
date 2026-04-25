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

  // Owner can't ban themselves (would lock out)
  if (admin.id === id && action === "ban") {
    return NextResponse.json(
      { error: "Can't ban yourself" },
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
    case "ban":
      await prisma.user.update({ where: { id }, data: { banned: true } });
      return NextResponse.json({ success: true });
    case "unban":
      await prisma.user.update({ where: { id }, data: { banned: false } });
      return NextResponse.json({ success: true });
    case "setFeatureFlags": {
      const flags = body.featureFlags;
      if (typeof flags !== "object" || flags === null) {
        return NextResponse.json(
          { error: "featureFlags must be an object" },
          { status: 400 }
        );
      }
      const json =
        Object.keys(flags as object).length === 0 ? null : JSON.stringify(flags);
      await prisma.user.update({
        where: { id },
        data: { featureFlags: json },
      });
      return NextResponse.json({ success: true });
    }
    case "setLimits": {
      const max = body.maxClipsPerMonth;
      const value =
        max === null || max === undefined
          ? null
          : typeof max === "number" && max >= 0
            ? Math.floor(max)
            : null;
      await prisma.user.update({
        where: { id },
        data: { maxClipsPerMonth: value },
      });
      return NextResponse.json({ success: true });
    }
    case "setNotes": {
      const notes = typeof body.notes === "string" ? body.notes : null;
      await prisma.user.update({
        where: { id },
        data: { notes: notes && notes.trim().length > 0 ? notes : null },
      });
      return NextResponse.json({ success: true });
    }
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
