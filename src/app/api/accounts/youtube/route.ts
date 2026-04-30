import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type YouTubeMeta = { subscribers?: number };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });

  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "youtube" } },
  });
  if (!account) return NextResponse.json({ connected: false });

  let meta: YouTubeMeta = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  // Google access tokens last only 1h. They're refreshed automatically
  // via refresh_token before every post call. So an "expired" access
  // token is NOT a reconnect signal — only a missing refresh_token is.
  // Without this, the badge cried "Reconnect now" within an hour of
  // every connect even though posting still worked.
  const needsReconnect = !account.refreshToken;
  return NextResponse.json({
    connected: true,
    needsReconnect,
    username: account.username,
    avatar: account.avatar,
    subscribers: meta.subscribers,
    channelId: account.externalId,
    expiresAt: account.expiresAt,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (session) {
    await prisma.socialAccount
      .delete({
        where: { userId_platform: { userId: session.id, platform: "youtube" } },
      })
      .catch(() => {});
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete("youtube_account");
  return response;
}
