import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { platform, selection } = body as {
    platform?: string;
    selection?: { pageId?: string; instagramId?: string };
  };

  if (
    (platform !== "facebook" && platform !== "instagram") ||
    !selection ||
    typeof selection !== "object"
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform } },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not connected" }, { status: 404 });
  }

  let meta: Record<string, unknown> = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  if (platform === "facebook" && selection.pageId) {
    const pages = (meta.pages as Array<{ id: string }> | undefined) ?? [];
    if (!pages.some((p) => p.id === selection.pageId)) {
      return NextResponse.json({ error: "Unknown page" }, { status: 400 });
    }
    meta.selectedPageId = selection.pageId;
  } else if (platform === "instagram" && selection.instagramId) {
    const accounts =
      (meta.accounts as Array<{ instagramId: string; pageId: string; username?: string; avatar?: string; followers?: number }> | undefined) ?? [];
    const match = accounts.find((a) => a.instagramId === selection.instagramId);
    if (!match) {
      return NextResponse.json({ error: "Unknown account" }, { status: 400 });
    }
    meta.selectedInstagramId = selection.instagramId;
    meta.selectedPageId = match.pageId;
    meta.followers = match.followers ?? 0;

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        externalId: match.instagramId,
        username: match.username ?? account.username,
        avatar: match.avatar ?? account.avatar,
        meta: JSON.stringify(meta),
      },
    });
    return NextResponse.json({ success: true });
  } else {
    return NextResponse.json({ error: "Missing selection" }, { status: 400 });
  }

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { meta: JSON.stringify(meta) },
  });
  return NextResponse.json({ success: true });
}
